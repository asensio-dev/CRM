import {
  INTERACTION_OUTCOMES,
  type InteractionOutcome,
  type WeeklyActivityDto,
  type WeeklyActivityPointDto,
  type WeeklyActivityQuery,
} from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/application';
import { type AnalyticsActor, resolveScope } from '../scope';
import { weeksWindow } from '../time/managua-time';
import { ANALYTICS_READER, type AnalyticsReader } from './read-ports';

const emptyOutcomes = () =>
  Object.fromEntries(INTERACTION_OUTCOMES.map((o) => [o, 0])) as Record<InteractionOutcome, number>;

@Injectable()
export class GetWeeklyActivityQuery {
  constructor(
    @Inject(ANALYTICS_READER) private readonly reader: AnalyticsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: AnalyticsActor, query: WeeklyActivityQuery): Promise<WeeklyActivityDto> {
    const scope = resolveScope(actor, query);
    const window = weeksWindow(this.clock.now(), query.weeks, query.from, query.to);
    const rows = await this.reader.weeklyActivity(
      scope,
      window.range,
      window.anchorDay,
      query.byExecutive,
    );

    // Todas las semanas de la ventana, también las vacías (series continuas para el gráfico).
    const weeks: WeeklyActivityPointDto[] = window.weekStarts.map((weekStart) => ({
      weekStart,
      interactions: 0,
      companiesContacted: 0,
      byOutcome: emptyOutcomes(),
      ...(query.byExecutive ? { executives: [] } : {}),
    }));

    for (const r of rows.outcomes) {
      const point = weeks[r.week];
      if (!point) continue;
      point.byOutcome[r.outcome] += r.count;
      point.interactions += r.count;
    }
    for (const r of rows.companies) {
      const point = weeks[r.week];
      if (point) point.companiesContacted = r.count;
    }
    for (const r of rows.executives) {
      weeks[r.week]?.executives?.push({
        userId: r.userId,
        fullName: r.fullName,
        interactions: r.interactions,
        companiesContacted: r.companies,
      });
    }
    return { weeks };
  }
}
