import type { ReleaseReason } from '@axiom/contracts';
import { Entity } from '../../../../shared/domain';
import { assignmentAlreadyReleased } from '../portfolio-errors';

export interface PortfolioAssignmentProps {
  id: number | null;
  companyId: number;
  userId: number;
  /** Ciclo en el que se asignó. */
  cycleId: number;
  assignedAt: Date;
  releasedAt: Date | null;
  releaseReason: ReleaseReason | null;
  cyclesWithoutProgress: number;
}

export type CycleOutcome = 'PROGRESS' | 'NO_PROGRESS' | 'RELEASED';

/**
 * Una empresa en la cartera de un ejecutivo. Activa mientras `releasedAt` es null
 * (la BD garantiza una sola asignación activa por empresa con un índice único filtrado).
 */
export class PortfolioAssignment extends Entity {
  private dirty = false;

  private constructor(private readonly props: PortfolioAssignmentProps) {
    super(props.id);
  }

  static assign(input: {
    companyId: number;
    userId: number;
    cycleId: number;
    at: Date;
  }): PortfolioAssignment {
    const a = new PortfolioAssignment({
      id: null,
      companyId: input.companyId,
      userId: input.userId,
      cycleId: input.cycleId,
      assignedAt: input.at,
      releasedAt: null,
      releaseReason: null,
      cyclesWithoutProgress: 0,
    });
    a.dirty = true;
    return a;
  }

  static restore(props: PortfolioAssignmentProps): PortfolioAssignment {
    return new PortfolioAssignment({ ...props });
  }

  get companyId(): number {
    return this.props.companyId;
  }
  get userId(): number {
    return this.props.userId;
  }
  get cycleId(): number {
    return this.props.cycleId;
  }
  get assignedAt(): Date {
    return this.props.assignedAt;
  }
  get releasedAt(): Date | null {
    return this.props.releasedAt;
  }
  get releaseReason(): ReleaseReason | null {
    return this.props.releaseReason;
  }
  get cyclesWithoutProgress(): number {
    return this.props.cyclesWithoutProgress;
  }
  get isActive(): boolean {
    return this.props.releasedAt === null;
  }
  get hasChanges(): boolean {
    return this.dirty;
  }

  release(reason: ReleaseReason, at: Date): void {
    if (!this.isActive) throw assignmentAlreadyReleased(this._id);
    this.props.releasedAt = at;
    this.props.releaseReason = reason;
    this.dirty = true;
  }

  /**
   * Resultado del ciclo que se cierra: con avance el contador vuelve a 0 (cuenta ciclos
   * consecutivos); sin avance suma 1 y, al llegar a `maxCycles`, la empresa vuelve al pool.
   */
  recordCycleOutcome(madeProgress: boolean, maxCycles: number, at: Date): CycleOutcome {
    if (!this.isActive) throw assignmentAlreadyReleased(this._id);
    this.dirty = true;
    if (madeProgress) {
      this.props.cyclesWithoutProgress = 0;
      return 'PROGRESS';
    }
    this.props.cyclesWithoutProgress += 1;
    if (this.props.cyclesWithoutProgress >= maxCycles) {
      this.release('SIN_AVANCE', at);
      return 'RELEASED';
    }
    return 'NO_PROGRESS';
  }

  assignId(id: number): void {
    this._id = id;
    this.props.id = id;
  }

  markPersisted(): void {
    this.dirty = false;
  }

  toProps(): PortfolioAssignmentProps {
    return { ...this.props };
  }
}
