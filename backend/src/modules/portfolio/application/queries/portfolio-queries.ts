import type {
  AssignmentDto,
  AssignmentsQuery,
  CurrentCycleDto,
  MyWeekDto,
  Paginated,
  UserRole,
} from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { EXECUTIVE_DIRECTORY, type ExecutiveDirectory, portfolioForbidden } from '../../domain';
import { isSupervisorRole, RotationContext, toWeekInfo } from '../services/rotation-context';
import { PORTFOLIO_READ_MODEL, type PortfolioReadModel } from './read-ports';

interface Viewer {
  userId: number;
  role: UserRole;
}

/** Un EJECUTIVO solo puede consultarse a sí mismo; ADMIN/SUPERVISOR a cualquiera. */
function resolveTarget(viewer: Viewer, requested: number | undefined): number {
  if (requested === undefined || requested === viewer.userId) return viewer.userId;
  if (!isSupervisorRole(viewer.role)) {
    throw portfolioForbidden('Solo ADMIN o SUPERVISOR pueden ver la cartera de otro usuario');
  }
  return requested;
}

/** "Mi semana": plan del ejecutivo con progreso `contactadas / cuota`. */
@Injectable()
export class GetMyWeekQuery {
  constructor(
    private readonly context: RotationContext,
    @Inject(PORTFOLIO_READ_MODEL) private readonly read: PortfolioReadModel,
  ) {}

  async execute(input: { viewer: Viewer; userId?: number }): Promise<MyWeekDto> {
    const userId = resolveTarget(input.viewer, input.userId);
    const { cycle, monday, settings } = await this.context.snapshot();
    const view = cycle ? await this.read.weekPlan(userId, monday) : { plan: null, items: [] };
    return {
      userId,
      week: cycle ? toWeekInfo(cycle, monday) : null,
      planId: view.plan?.id ?? null,
      generatedAt: view.plan ? view.plan.generatedAt.toISOString() : null,
      quota: view.plan?.quota ?? settings.weeklyQuota,
      contactedCount: view.items.filter((i) => i.contactedAt !== null).length,
      totalItems: view.items.length,
      items: view.items,
    };
  }
}

/** Ciclo actual con la cobertura por ejecutivo (un EJECUTIVO solo ve su fila). */
@Injectable()
export class GetCurrentCycleQuery {
  constructor(
    private readonly context: RotationContext,
    @Inject(PORTFOLIO_READ_MODEL) private readonly read: PortfolioReadModel,
    @Inject(EXECUTIVE_DIRECTORY) private readonly directory: ExecutiveDirectory,
  ) {}

  async execute(input: { viewer: Viewer }): Promise<CurrentCycleDto> {
    const { cycle, monday, settings, calendar } = await this.context.snapshot();
    if (!cycle) return { week: null, executives: [] };
    const rows = new Map(
      (await this.read.coverage(calendar.range(cycle.startDate, cycle.endDate), monday)).map(
        (r) => [r.userId, r],
      ),
    );
    let executives = await this.directory.listActiveExecutives();
    if (!isSupervisorRole(input.viewer.role)) {
      executives = executives.filter((e) => e.id === input.viewer.userId);
    }
    return {
      week: toWeekInfo(cycle, monday),
      executives: executives.map((e) => {
        const row = rows.get(e.id);
        const assigned = row?.assigned ?? 0;
        const contacted = row?.contactedThisCycle ?? 0;
        return {
          userId: e.id,
          fullName: e.fullName,
          assigned,
          target: settings.portfolioSize,
          contactedThisCycle: contacted,
          coveragePct: assigned === 0 ? 0 : Math.round((contacted / assigned) * 1000) / 10,
          plan: row?.plan ?? null,
        };
      }),
    };
  }
}

@Injectable()
export class ListAssignmentsQuery {
  constructor(@Inject(PORTFOLIO_READ_MODEL) private readonly read: PortfolioReadModel) {}

  execute(input: { viewer: Viewer; query: AssignmentsQuery }): Promise<Paginated<AssignmentDto>> {
    const userId = isSupervisorRole(input.viewer.role)
      ? input.query.userId
      : resolveTarget(input.viewer, input.query.userId);
    return this.read.assignments({ ...input.query, userId });
  }
}
