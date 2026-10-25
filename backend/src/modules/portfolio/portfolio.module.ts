import { Global, Module } from '@nestjs/common';
import { COMPANY_ACCESS_POLICY } from '../pipeline';
import {
  GetCurrentCycleQuery,
  GetMyWeekQuery,
  ListAssignmentsQuery,
} from './application/queries/portfolio-queries';
import { PORTFOLIO_READ_MODEL } from './application/queries/read-ports';
import { PortfolioCompanyAccessPolicy } from './application/services/portfolio-company-access.policy';
import { RotationContext } from './application/services/rotation-context';
import {
  BulkAssignCompaniesUseCase,
  ReassignCompaniesUseCase,
  ReleaseAssignmentUseCase,
} from './application/use-cases/assignment-commands.use-case';
import { CloseCycleUseCase } from './application/use-cases/close-cycle.use-case';
import { GenerateWeeklyPlansUseCase } from './application/use-cases/generate-weekly-plans.use-case';
import {
  MarkPlanItemContactedUseCase,
  ReleaseOnStatusChangeUseCase,
} from './application/use-cases/pipeline-reactions.use-case';
import { RefillPortfoliosUseCase } from './application/use-cases/refill-portfolios.use-case';
import { RunWeeklyRotationUseCase } from './application/use-cases/run-weekly-rotation.use-case';
import {
  ASSIGNMENT_REPOSITORY,
  COMPANY_LOOKUP,
  CYCLE_EVIDENCE_READER,
  CYCLE_REPOSITORY,
  DefaultPoolSelectionStrategy,
  DefaultPrioritizationStrategy,
  EXECUTIVE_DIRECTORY,
  PLAN_CANDIDATE_READER,
  POOL_READER,
  POOL_SELECTION_STRATEGY,
  PORTFOLIO_PRIORITIZATION_STRATEGY,
  PORTFOLIO_SETTINGS,
  WEEKLY_PLAN_REPOSITORY,
} from './domain';
import { PipelineEventsSubscriber } from './infrastructure/events/pipeline-events.subscriber';
import { PortfolioController } from './infrastructure/http/portfolio.controller';
import {
  PrismaPlanCandidateReader,
  PrismaPoolReader,
  PrismaPortfolioReadModel,
} from './infrastructure/persistence/prisma-portfolio.readers';
import {
  PrismaAssignmentRepository,
  PrismaCycleRepository,
  PrismaExecutiveDirectory,
  PrismaPortfolioSettings,
  PrismaWeeklyPlanRepository,
} from './infrastructure/persistence/prisma-portfolio.repositories';
import { WeeklyRotationScheduler } from './infrastructure/scheduling/weekly-rotation.scheduler';

/**
 * Cartera rotativa: ciclos, asignaciones, plan semanal, reasignaciones y job semanal.
 *
 * Es @Global solo para exportar `COMPANY_ACCESS_POLICY`: así el PipelineModule (que no conoce
 * portfolio) recibe la política real sin importar este módulo y sin dependencias circulares
 * (ver ADR 0005). UNIT_OF_WORK, EVENT_BUS y CLOCK llegan del SharedModule global.
 */
@Global()
@Module({
  controllers: [PortfolioController],
  providers: [
    { provide: PORTFOLIO_SETTINGS, useClass: PrismaPortfolioSettings },
    { provide: CYCLE_REPOSITORY, useClass: PrismaCycleRepository },
    { provide: ASSIGNMENT_REPOSITORY, useClass: PrismaAssignmentRepository },
    { provide: WEEKLY_PLAN_REPOSITORY, useClass: PrismaWeeklyPlanRepository },
    { provide: EXECUTIVE_DIRECTORY, useClass: PrismaExecutiveDirectory },
    { provide: POOL_READER, useClass: PrismaPoolReader },
    { provide: COMPANY_LOOKUP, useExisting: POOL_READER },
    { provide: PLAN_CANDIDATE_READER, useClass: PrismaPlanCandidateReader },
    { provide: CYCLE_EVIDENCE_READER, useExisting: PLAN_CANDIDATE_READER },
    { provide: PORTFOLIO_READ_MODEL, useClass: PrismaPortfolioReadModel },
    { provide: PORTFOLIO_PRIORITIZATION_STRATEGY, useClass: DefaultPrioritizationStrategy },
    { provide: POOL_SELECTION_STRATEGY, useClass: DefaultPoolSelectionStrategy },
    PortfolioCompanyAccessPolicy,
    { provide: COMPANY_ACCESS_POLICY, useExisting: PortfolioCompanyAccessPolicy },
    RotationContext,
    CloseCycleUseCase,
    RefillPortfoliosUseCase,
    GenerateWeeklyPlansUseCase,
    RunWeeklyRotationUseCase,
    ReassignCompaniesUseCase,
    BulkAssignCompaniesUseCase,
    ReleaseAssignmentUseCase,
    MarkPlanItemContactedUseCase,
    ReleaseOnStatusChangeUseCase,
    GetMyWeekQuery,
    GetCurrentCycleQuery,
    ListAssignmentsQuery,
    PipelineEventsSubscriber,
    WeeklyRotationScheduler,
  ],
  exports: [COMPANY_ACCESS_POLICY, RunWeeklyRotationUseCase],
})
export class PortfolioModule {}
