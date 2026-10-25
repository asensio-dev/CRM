import type { ReleaseReason } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/application';
import {
  ASSIGNMENT_REPOSITORY,
  type AssignmentRepository,
  BusinessCalendar,
  mondayOf,
  PORTFOLIO_SETTINGS,
  type PortfolioSettingsProvider,
  WEEKLY_PLAN_REPOSITORY,
  type WeeklyPlanRepository,
} from '../../domain';

/**
 * Se registró una interacción: marca como contactado el ítem del plan.
 * Con `planItemId` se marca ese ítem (si es de la misma empresa); si no viene (o no coincide),
 * se marcan los ítems de esa empresa en los planes de la semana (local) en que ocurrió.
 */
@Injectable()
export class MarkPlanItemContactedUseCase {
  constructor(
    @Inject(WEEKLY_PLAN_REPOSITORY) private readonly plans: WeeklyPlanRepository,
    @Inject(PORTFOLIO_SETTINGS) private readonly settings: PortfolioSettingsProvider,
  ) {}

  async execute(input: {
    companyId: number;
    planItemId: number | null;
    occurredAt: Date;
  }): Promise<number> {
    if (input.planItemId !== null) {
      const marked = await this.plans.markItemContacted(
        input.planItemId,
        input.companyId,
        input.occurredAt,
      );
      if (marked > 0) return marked;
    }
    const { timezone } = await this.settings.get();
    const monday = mondayOf(new BusinessCalendar(timezone).today(input.occurredAt));
    return this.plans.markCompanyContactedInWeek(input.companyId, monday, input.occurredAt);
  }
}

const RELEASE_ON_STATUS: Partial<Record<string, ReleaseReason>> = {
  CONTRATO_ACTIVO: 'CONTRATO_ACTIVO',
  DESCARTADO: 'DESCARTADO',
};

/** Cambio de estado del pipeline: CONTRATO_ACTIVO / DESCARTADO sacan la empresa de la rotación. */
@Injectable()
export class ReleaseOnStatusChangeUseCase {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: { companyId: number; to: string; occurredAt: Date }): Promise<number> {
    const reason = RELEASE_ON_STATUS[input.to];
    if (!reason) return 0;
    return this.uow.run(async () => {
      const active = await this.assignments.findActiveByCompanyIds([input.companyId]);
      for (const a of active) a.release(reason, input.occurredAt);
      await this.assignments.saveAll(active);
      return active.length;
    });
  }
}
