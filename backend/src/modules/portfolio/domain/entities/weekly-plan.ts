import { DomainError } from '../../../../shared/domain';
import { isoWeekday, type LocalDate } from '../calendar/business-calendar';
import type { PlannedItem } from '../services/prioritization-strategy';

export interface WeeklyPlanProps {
  userId: number;
  cycleId: number;
  weekNumber: number;
  weekStart: LocalDate;
  quota: number;
  items: PlannedItem[];
}

/** Plan semanal de un ejecutivo (fábrica con invariantes; se persiste una sola vez por semana). */
export class WeeklyPlan {
  private constructor(readonly props: Readonly<WeeklyPlanProps>) {}

  static generate(props: WeeklyPlanProps): WeeklyPlan {
    if (isoWeekday(props.weekStart) !== 1) {
      throw DomainError.validation('PORTFOLIO_WEEK_NOT_MONDAY', 'La semana debe empezar en lunes');
    }
    if (props.weekNumber < 1) {
      throw DomainError.validation('PORTFOLIO_INVALID_WEEK', 'Número de semana inválido');
    }
    const ids = new Set(props.items.map((i) => i.companyId));
    if (ids.size !== props.items.length) {
      throw DomainError.validation('PORTFOLIO_DUPLICATED_PLAN_ITEM', 'Empresa repetida en el plan');
    }
    return new WeeklyPlan({ ...props, items: [...props.items] });
  }

  get userId(): number {
    return this.props.userId;
  }
  get weekStart(): LocalDate {
    return this.props.weekStart;
  }
  get items(): readonly PlannedItem[] {
    return this.props.items;
  }
}
