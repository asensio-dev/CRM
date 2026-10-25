import { Module } from '@nestjs/common';
import {
  GetBoardQuery,
  GetPipelineStateQuery,
  GetTimelineQuery,
} from './application/queries/pipeline-queries';
import { PIPELINE_BOARD_READER, PIPELINE_TIMELINE_READER } from './application/queries/read-ports';
import { ChangeCompanyStatusUseCase } from './application/use-cases/change-company-status.use-case';
import { RegisterInteractionUseCase } from './application/use-cases/register-interaction.use-case';
import { COMPANY_PIPELINE_REPOSITORY, DefaultOutcomePolicy, OUTCOME_POLICY } from './domain';
import { PipelineController } from './infrastructure/http/pipeline.controller';
import { PrismaBoardReader } from './infrastructure/persistence/prisma-board.reader';
import { PrismaCompanyPipelineRepository } from './infrastructure/persistence/prisma-company-pipeline.repository';
import { PrismaTimelineReader } from './infrastructure/persistence/prisma-timeline.reader';

/** Máquina de estados, historial e interacciones. UNIT_OF_WORK, EVENT_BUS y CLOCK llegan del SharedModule global. */
@Module({
  controllers: [PipelineController],
  providers: [
    { provide: COMPANY_PIPELINE_REPOSITORY, useClass: PrismaCompanyPipelineRepository },
    { provide: PIPELINE_TIMELINE_READER, useClass: PrismaTimelineReader },
    { provide: PIPELINE_BOARD_READER, useClass: PrismaBoardReader },
    { provide: OUTCOME_POLICY, useClass: DefaultOutcomePolicy },
    ChangeCompanyStatusUseCase,
    RegisterInteractionUseCase,
    GetPipelineStateQuery,
    GetTimelineQuery,
    GetBoardQuery,
  ],
  exports: [ChangeCompanyStatusUseCase, RegisterInteractionUseCase],
})
export class PipelineModule {}
