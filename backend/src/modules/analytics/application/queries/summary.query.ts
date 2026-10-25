import type { AnalyticsFilter, SummaryDto } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/application';
import { type AnalyticsActor, resolveScope } from '../scope';
import { pct, periodRange, weekOf } from '../time/managua-time';
import { ANALYTICS_READER, type AnalyticsReader } from './read-ports';

@Injectable()
export class GetSummaryQuery {
  constructor(
    @Inject(ANALYTICS_READER) private readonly reader: AnalyticsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: AnalyticsActor, filter: AnalyticsFilter): Promise<SummaryDto> {
    const now = this.clock.now();
    const scope = resolveScope(actor, filter);
    const week = weekOf(now);
    const weekRange = { from: week.startUtc, to: week.endUtc };
    const period = periodRange(filter.from, filter.to);

    const [settings, executives, byStatus, reached, contacts, appointments, contracts] =
      await Promise.all([
        this.reader.settings(),
        this.reader.activeExecutives(scope),
        this.reader.companiesByStatus(scope),
        this.reader.reachedByStatus(scope, period),
        this.reader.contactPairs(scope, weekRange),
        this.reader.appointments(scope, weekRange),
        this.reader.activeContracts(scope),
      ]);

    const total = Object.values(byStatus).reduce((sum, n) => sum + (n ?? 0), 0);
    const target = executives.length * settings.weeklyQuota;
    const contacted = reached.CONTACTADO ?? 0;
    const contracted = reached.CONTRATO_ACTIVO ?? 0;
    const rate = pct(contracted, contacted);

    return {
      generatedAt: now.toISOString(),
      week: { start: week.startDay, end: week.endDay },
      companies: { total, inPipeline: total - (byStatus.POR_CONTACTAR ?? 0) },
      contactsThisWeek: contacts,
      weeklyQuota: {
        activeExecutives: executives.length,
        quotaPerExecutive: settings.weeklyQuota,
        target,
        compliancePct: pct(contacts, target),
      },
      appointmentsThisWeek: appointments,
      contractsActive: {
        count: contracts.reduce((sum, c) => sum + c.count, 0),
        totalsByCurrency: contracts,
      },
      conversion: {
        contacted,
        contracted,
        ratePct: rate === null ? null : Math.min(100, rate),
      },
    };
  }
}
