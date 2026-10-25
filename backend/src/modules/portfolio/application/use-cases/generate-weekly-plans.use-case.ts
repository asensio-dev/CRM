import { Inject, Injectable } from '@nestjs/common';
import {
  type BusinessCalendar,
  EXECUTIVE_DIRECTORY,
  type ExecutiveDirectory,
  type LocalDate,
  PLAN_CANDIDATE_READER,
  type PlanCandidateReader,
  PORTFOLIO_PRIORITIZATION_STRATEGY,
  type PortfolioPrioritizationStrategy,
  type PortfolioSettings,
  type RotationCycle,
  WEEKLY_PLAN_REPOSITORY,
  WeeklyPlan,
  type WeeklyPlanRepository,
} from '../../domain';

export interface GeneratePlansInput {
  cycle: RotationCycle;
  /** Lunes de la semana a planificar. */
  monday: LocalDate;
  settings: PortfolioSettings;
  calendar: BusinessCalendar;
  /** Por defecto, todos los ejecutivos activos. */
  userIds?: number[];
}

export interface GeneratePlansSummary {
  generated: number;
  existing: number;
  /** Ejecutivos sin cartera (no se crea plan vacío). */
  empty: number;
  items: number;
}

/**
 * Genera el plan semanal de cada ejecutivo con la `PortfolioPrioritizationStrategy`.
 * Idempotente: quien ya tiene plan esa semana se salta (y el índice único userId+weekStart
 * protege frente a ejecuciones concurrentes).
 */
@Injectable()
export class GenerateWeeklyPlansUseCase {
  constructor(
    @Inject(EXECUTIVE_DIRECTORY) private readonly directory: ExecutiveDirectory,
    @Inject(PLAN_CANDIDATE_READER) private readonly candidates: PlanCandidateReader,
    @Inject(PORTFOLIO_PRIORITIZATION_STRATEGY)
    private readonly strategy: PortfolioPrioritizationStrategy,
    @Inject(WEEKLY_PLAN_REPOSITORY) private readonly plans: WeeklyPlanRepository,
  ) {}

  async execute(input: GeneratePlansInput): Promise<GeneratePlansSummary> {
    const { cycle, monday, settings, calendar } = input;
    const summary: GeneratePlansSummary = { generated: 0, existing: 0, empty: 0, items: 0 };
    let userIds = (await this.directory.listActiveExecutives()).map((e) => e.id);
    if (input.userIds) userIds = userIds.filter((id) => input.userIds?.includes(id));

    const withPlan = await this.plans.usersWithPlan(monday);
    const weekNumber = cycle.weekNumberOf(monday);
    const windows = {
      cycle: calendar.range(cycle.startDate, cycle.endDate),
      week: calendar.week(monday),
    };

    for (const userId of userIds) {
      if (withPlan.has(userId)) {
        summary.existing++;
        continue;
      }
      const portfolio = await this.candidates.forUser(userId, windows);
      const items = this.strategy.prioritize(portfolio, {
        quota: settings.weeklyQuota,
        weekNumber,
        totalWeeks: cycle.totalWeeks,
      });
      if (items.length === 0) {
        summary.empty++;
        continue;
      }
      const plan = WeeklyPlan.generate({
        userId,
        cycleId: cycle.id as number,
        weekNumber,
        weekStart: monday,
        quota: settings.weeklyQuota,
        items,
      });
      // Plan + ítems en una sola sentencia anidada (atómica): no hace falta UnitOfWork y así un
      // choque con el índice único (ejecución concurrente) no deja una transacción a medias.
      const { created } = await this.plans.create(plan);
      if (created) {
        summary.generated++;
        summary.items += items.length;
      } else {
        summary.existing++;
      }
    }
    return summary;
  }
}
