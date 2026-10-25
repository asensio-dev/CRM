import {
  type AnalyticsFilter,
  AnalyticsFilterSchema,
  type CycleCoverageDto,
  type ExecutivesDto,
  type FunnelDto,
  type SummaryDto,
  type WeeklyActivityDto,
  type WeeklyActivityQuery,
  WeeklyActivityQuerySchema,
} from '@axiom/contracts';
import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import { GetCycleCoverageQuery } from '../../application/queries/cycle-coverage.query';
import { GetExecutivesQuery } from '../../application/queries/executives.query';
import { GetFunnelQuery } from '../../application/queries/funnel.query';
import { GetSummaryQuery } from '../../application/queries/summary.query';
import { GetWeeklyActivityQuery } from '../../application/queries/weekly-activity.query';
import type { AnalyticsActor } from '../../application/scope';

/** Cualquier usuario autenticado; el alcance (propio vs. todos) lo decide `resolveScope` por rol. */
function actorOf(user: AuthenticatedUser | undefined): AnalyticsActor {
  if (!user) throw new UnauthorizedException('Autenticación requerida');
  return { userId: user.id, role: user.role };
}

@ApiTags('Analítica')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly summaryQuery: GetSummaryQuery,
    private readonly funnelQuery: GetFunnelQuery,
    private readonly weeklyQuery: GetWeeklyActivityQuery,
    private readonly executivesQuery: GetExecutivesQuery,
    private readonly coverageQuery: GetCycleCoverageQuery,
  ) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(AnalyticsFilterSchema)) filter: AnalyticsFilter,
  ): Promise<SummaryDto> {
    return this.summaryQuery.execute(actorOf(user), filter);
  }

  @Get('funnel')
  funnel(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(AnalyticsFilterSchema)) filter: AnalyticsFilter,
  ): Promise<FunnelDto> {
    return this.funnelQuery.execute(actorOf(user), filter);
  }

  @Get('weekly-activity')
  weeklyActivity(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(WeeklyActivityQuerySchema)) query: WeeklyActivityQuery,
  ): Promise<WeeklyActivityDto> {
    return this.weeklyQuery.execute(actorOf(user), query);
  }

  @Get('executives')
  executives(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(AnalyticsFilterSchema)) filter: AnalyticsFilter,
  ): Promise<ExecutivesDto> {
    return this.executivesQuery.execute(actorOf(user), filter);
  }

  @Get('cycle-coverage')
  cycleCoverage(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(AnalyticsFilterSchema)) filter: AnalyticsFilter,
  ): Promise<CycleCoverageDto> {
    return this.coverageQuery.execute(actorOf(user), filter);
  }
}
