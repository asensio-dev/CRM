import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/application';
import {
  ASSIGNMENT_REPOSITORY,
  type AssignmentRepository,
  EXECUTIVE_DIRECTORY,
  type ExecutiveDirectory,
  POOL_READER,
  POOL_SELECTION_STRATEGY,
  type PoolReader,
  type PoolSelectionStrategy,
  PortfolioAssignment,
  type PortfolioSettings,
  type RotationCycle,
} from '../../domain';

export interface RefillInput {
  cycle: RotationCycle;
  settings: PortfolioSettings;
  now: Date;
}

export interface RefillSummary {
  executives: number;
  assigned: number;
  /** Huecos que no se pudieron llenar porque el pool no tenía empresas suficientes. */
  shortfall: number;
  /** Asignaciones de usuarios inactivos o que ya no son EJECUTIVO devueltas al pool. */
  orphansReleased: number;
}

/**
 * Rellena las carteras de los ejecutivos activos hasta PORTFOLIO_SIZE con empresas del pool,
 * repartidas por la `PoolSelectionStrategy`. Idempotente: si nadie tiene hueco no hace nada.
 */
@Injectable()
export class RefillPortfoliosUseCase {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(EXECUTIVE_DIRECTORY) private readonly directory: ExecutiveDirectory,
    @Inject(POOL_READER) private readonly pool: PoolReader,
    @Inject(POOL_SELECTION_STRATEGY) private readonly strategy: PoolSelectionStrategy,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute({ cycle, settings, now }: RefillInput): Promise<RefillSummary> {
    return this.uow.run(async () => {
      const executives = await this.directory.listActiveExecutives();
      const execIds = new Set(executives.map((e) => e.id));
      const counts = await this.assignments.countActiveByUser();

      // Carteras huérfanas (usuario desactivado o cambiado de rol) → vuelven al pool.
      let orphansReleased = 0;
      for (const userId of counts.keys()) {
        if (execIds.has(userId)) continue;
        const orphan = await this.assignments.findActive({ userId });
        for (const a of orphan) a.release('REASIGNACION_MANUAL', now);
        await this.assignments.saveAll(orphan);
        orphansReleased += orphan.length;
      }

      const demands = executives.map((e) => ({
        userId: e.id,
        count: Math.max(0, settings.portfolioSize - (counts.get(e.id) ?? 0)),
      }));
      const needed = demands.reduce((sum, d) => sum + d.count, 0);
      if (needed === 0) {
        return { executives: executives.length, assigned: 0, shortfall: 0, orphansReleased };
      }

      const candidates = await this.pool.findCandidates(needed * 2 + 50);
      const plan = this.strategy.distribute(candidates, demands);
      const fresh: PortfolioAssignment[] = [];
      for (const [userId, companyIds] of plan) {
        for (const companyId of companyIds) {
          fresh.push(
            PortfolioAssignment.assign({ companyId, userId, cycleId: cycle.id as number, at: now }),
          );
        }
      }
      await this.assignments.saveAll(fresh);
      return {
        executives: executives.length,
        assigned: fresh.length,
        shortfall: needed - fresh.length,
        orphansReleased,
      };
    });
  }
}
