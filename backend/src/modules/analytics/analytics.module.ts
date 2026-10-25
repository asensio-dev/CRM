import { Module } from '@nestjs/common';
import { GetCycleCoverageQuery } from './application/queries/cycle-coverage.query';
import { GetExecutivesQuery } from './application/queries/executives.query';
import { GetFunnelQuery } from './application/queries/funnel.query';
import { ANALYTICS_READER } from './application/queries/read-ports';
import { GetSummaryQuery } from './application/queries/summary.query';
import { GetWeeklyActivityQuery } from './application/queries/weekly-activity.query';
import { AnalyticsController } from './infrastructure/http/analytics.controller';
import { PrismaAnalyticsReader } from './infrastructure/persistence/prisma-analytics.reader';

/** Indicadores del tablero: solo lectura (CQRS-lite), sin agregados de dominio. */
@Module({
  controllers: [AnalyticsController],
  providers: [
    { provide: ANALYTICS_READER, useClass: PrismaAnalyticsReader },
    GetSummaryQuery,
    GetFunnelQuery,
    GetWeeklyActivityQuery,
    GetExecutivesQuery,
    GetCycleCoverageQuery,
  ],
})
export class AnalyticsModule {}
