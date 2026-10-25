import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline';
import { ChangeContractStatusUseCase } from './application/use-cases/change-contract-status.use-case';
import { GetContractUseCase, ListContractsUseCase } from './application/use-cases/contract-queries';
import { CreateContractUseCase } from './application/use-cases/create-contract.use-case';
import { UpdateContractDraftUseCase } from './application/use-cases/update-contract-draft.use-case';
import { COMPANY_PIPELINE_GATEWAY, CONTRACT_READER, CONTRACT_REPOSITORY } from './domain';
import { ContractsController } from './infrastructure/http/contracts.controller';
import { PrismaContractReader } from './infrastructure/persistence/prisma-contract.reader';
import { PrismaContractRepository } from './infrastructure/persistence/prisma-contract.repository';
import { PipelineStatusGateway } from './infrastructure/pipeline/pipeline-status.gateway';

/** Contratos de venta. UNIT_OF_WORK, EVENT_BUS y CLOCK llegan del SharedModule global. */
@Module({
  imports: [PipelineModule],
  controllers: [ContractsController],
  providers: [
    { provide: CONTRACT_REPOSITORY, useClass: PrismaContractRepository },
    { provide: CONTRACT_READER, useClass: PrismaContractReader },
    { provide: COMPANY_PIPELINE_GATEWAY, useClass: PipelineStatusGateway },
    CreateContractUseCase,
    UpdateContractDraftUseCase,
    ChangeContractStatusUseCase,
    ListContractsUseCase,
    GetContractUseCase,
  ],
})
export class ContractsModule {}
