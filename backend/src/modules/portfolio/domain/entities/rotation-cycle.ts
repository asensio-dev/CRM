import { DomainError, Entity } from '../../../../shared/domain';
import {
  addDays,
  diffDays,
  isoWeekday,
  type LocalDate,
  maxDate,
  mondayOf,
} from '../calendar/business-calendar';

export interface RotationCycleProps {
  id: number | null;
  number: number;
  startDate: LocalDate;
  /** Último día del ciclo (domingo), inclusive. */
  endDate: LocalDate;
  closedAt: Date | null;
}

/**
 * Ciclo de rotación de N semanas (lunes → domingo). Cada ciclo guarda sus fechas, así que
 * cambiar ROTATION_CYCLE_WEEKS solo afecta a los ciclos que se abran después.
 */
export class RotationCycle extends Entity {
  private constructor(private readonly props: RotationCycleProps) {
    super(props.id);
  }

  static restore(props: RotationCycleProps): RotationCycle {
    return new RotationCycle({ ...props });
  }

  /**
   * Abre el ciclo siguiente a `previous` (o el primero). Empieza el lunes posterior al fin del
   * anterior; si se saltaron ciclos (el job no corrió), empieza el lunes de la semana de `today`.
   */
  static openNext(previous: RotationCycle | null, today: LocalDate, weeks: number): RotationCycle {
    if (!Number.isInteger(weeks) || weeks < 1) {
      throw DomainError.validation('PORTFOLIO_INVALID_CYCLE_WEEKS', 'Semanas de ciclo inválidas');
    }
    const thisMonday = mondayOf(today);
    const startDate = previous ? maxDate(addDays(previous.endDate, 1), thisMonday) : thisMonday;
    return new RotationCycle({
      id: null,
      number: (previous?.number ?? 0) + 1,
      startDate,
      endDate: addDays(startDate, weeks * 7 - 1),
      closedAt: null,
    });
  }

  get number(): number {
    return this.props.number;
  }
  get startDate(): LocalDate {
    return this.props.startDate;
  }
  get endDate(): LocalDate {
    return this.props.endDate;
  }
  get closedAt(): Date | null {
    return this.props.closedAt;
  }
  get isClosed(): boolean {
    return this.props.closedAt !== null;
  }
  get totalWeeks(): number {
    return Math.max(1, Math.round((diffDays(this.endDate, this.startDate) + 1) / 7));
  }
  /** Lunes de la última semana del ciclo. */
  get lastWeekStart(): LocalDate {
    return this.weekStart(this.totalWeeks);
  }

  contains(date: LocalDate): boolean {
    return date >= this.startDate && date <= this.endDate;
  }

  /** El ciclo terminó si `today` es posterior a su último día. */
  hasEndedBy(today: LocalDate): boolean {
    return today > this.endDate;
  }

  /** Semana 1..N dentro del ciclo de la fecha (acotada a los extremos). */
  weekNumberOf(date: LocalDate): number {
    const k = Math.floor(diffDays(date, this.startDate) / 7) + 1;
    return Math.min(Math.max(k, 1), this.totalWeeks);
  }

  weekStart(weekNumber: number): LocalDate {
    return addDays(this.startDate, (weekNumber - 1) * 7);
  }

  close(at: Date): void {
    if (this.isClosed) return; // idempotente
    this.props.closedAt = at;
  }

  assignId(id: number): void {
    this._id = id;
    this.props.id = id;
  }

  toProps(): RotationCycleProps {
    return { ...this.props };
  }
}

export const isMonday = (d: LocalDate) => isoWeekday(d) === 1;
