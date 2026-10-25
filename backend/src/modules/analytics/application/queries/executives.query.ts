import type { AnalyticsFilter, ExecutivesDto } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/application';
import { type AnalyticsActor, resolveScope } from '../scope';
import { managuaDay, pct, weekOf } from '../time/managua-time';
import { cycleRange, toCycleInfo } from './cycle';
import { ANALYTICS_READER, type AnalyticsReader } from './read-ports';

@Injectable()
export class GetExecutivesQuery {
  constructor(
    @Inject(ANALYTICS_READER) private readonly reader: AnalyticsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: AnalyticsActor, filter: AnalyticsFilter): Promise<ExecutivesDto> {
    const now = this.clock.now();
    const scope = resolveScope(actor, filter);
    const week = weekOf(now);
    const cycleRow = await this.reader.currentCycle(managuaDay(now));
    const [settings, executives, metrics] = await Promise.all([
      this.reader.settings(),
      this.reader.activeExecutives(scope),
      this.reader.executiveMetrics(
        scope,
        { from: week.startUtc, to: week.endUtc },
        cycleRow ? cycleRange(cycleRow) : null,
      ),
    ]);

    return {
      week: { start: week.startDay, end: week.endDay },
      cycle: cycleRow ? toCycleInfo(cycleRow, now) : null,
      executives: executives.map((e) => {
        const assigned = metrics.assigned.get(e.id) ?? 0;
        const contactedThisWeek = metrics.contactedWeek.get(e.id) ?? 0;
        const contactedThisCycle = cycleRow ? (metrics.contactedCycle.get(e.id) ?? 0) : 0;
        return {
          userId: e.id,
          fullName: e.fullName,
          assigned,
          contactedThisWeek,
          weeklyQuota: settings.weeklyQuota,
          quotaPct: pct(contactedThisWeek, settings.weeklyQuota),
          contactedThisCycle,
          cycleCoveragePct: pct(contactedThisCycle, assigned),
          statusAdvancesThisWeek: metrics.advancesWeek.get(e.id) ?? 0,
          appointmentsThisWeek: metrics.appointmentsWeek.get(e.id) ?? 0,
          contractsActive: metrics.contractsActive.get(e.id) ?? 0,
        };
      }),
    };
  }
}
