import type { AnalyticsFilter, CycleCoverageDto } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/application';
import { type AnalyticsActor, resolveScope } from '../scope';
import { managuaDay, pct, weekOf } from '../time/managua-time';
import { cycleRange, toCycleInfo } from './cycle';
import { ANALYTICS_READER, type AnalyticsReader } from './read-ports';

@Injectable()
export class GetCycleCoverageQuery {
  constructor(
    @Inject(ANALYTICS_READER) private readonly reader: AnalyticsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: AnalyticsActor, filter: AnalyticsFilter): Promise<CycleCoverageDto> {
    const now = this.clock.now();
    const scope = resolveScope(actor, filter);
    const cycleRow = await this.reader.currentCycle(managuaDay(now));
    if (!cycleRow) {
      return {
        cycle: null,
        executives: [],
        totals: { assigned: 0, contacted: 0, pending: 0, coveragePct: null },
      };
    }
    const week = weekOf(now);
    const [executives, metrics] = await Promise.all([
      this.reader.activeExecutives(scope),
      this.reader.executiveMetrics(
        scope,
        { from: week.startUtc, to: week.endUtc },
        cycleRange(cycleRow),
      ),
    ]);

    const rows = executives.map((e) => {
      const assigned = metrics.assigned.get(e.id) ?? 0;
      const contacted = Math.min(assigned, metrics.contactedCycle.get(e.id) ?? 0);
      return {
        userId: e.id,
        fullName: e.fullName,
        assigned,
        contacted,
        pending: assigned - contacted,
        coveragePct: pct(contacted, assigned),
      };
    });
    const assigned = rows.reduce((s, r) => s + r.assigned, 0);
    const contacted = rows.reduce((s, r) => s + r.contacted, 0);
    return {
      cycle: toCycleInfo(cycleRow, now),
      executives: rows,
      totals: {
        assigned,
        contacted,
        pending: assigned - contacted,
        coveragePct: pct(contacted, assigned),
      },
    };
  }
}
