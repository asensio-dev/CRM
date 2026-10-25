import type { ContractDto, CreateContractCommand } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  EVENT_BUS,
  type EventBus,
  UNIT_OF_WORK,
  type UnitOfWork,
  type UseCase,
} from '../../../../shared/application';
import {
  COMPANY_PIPELINE_GATEWAY,
  CONTRACT_READER,
  CONTRACT_REPOSITORY,
  type CompanyPipelineGateway,
  Contract,
  type ContractReader,
  type ContractRepository,
  todayInNicaragua,
} from '../../domain';
import type { ContractActor } from '../actor';

export interface CreateContractInput {
  data: CreateContractCommand;
  actor: ContractActor;
}

/**
 * Crea un contrato BORRADOR. Pipeline: la empresa pasa de AGENDANDO_CITA a EN_PROCESO_CONTRATO;
 * si ya está en EN_PROCESO_CONTRATO o CONTRATO_ACTIVO (otro contrato / renovación) no cambia;
 * desde cualquier otro estado se rechaza con CONTRACT_COMPANY_NOT_READY. Ver ADR 0005.
 */
@Injectable()
export class CreateContractUseCase implements UseCase<CreateContractInput, ContractDto> {
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(CONTRACT_READER) private readonly reader: ContractReader,
    @Inject(COMPANY_PIPELINE_GATEWAY) private readonly pipeline: CompanyPipelineGateway,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ data, actor }: CreateContractInput): Promise<ContractDto> {
    const now = this.clock.now();
    const contract = Contract.create(
      {
        companyId: data.companyId,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        amount: data.amount,
        currency: data.currency,
        notes: data.notes,
        createdById: actor.userId,
      },
      now,
    );
    await this.uow.run(async () => {
      await this.pipeline.advance({
        companyId: data.companyId,
        target: 'EN_PROCESO_CONTRATO',
        tolerated: ['EN_PROCESO_CONTRATO', 'CONTRATO_ACTIVO'],
        actor,
        note: 'Contrato creado',
      });
      await this.contracts.insert(contract, now.getUTCFullYear());
    });
    await this.events.publishAll(contract.pullEvents());
    return (await this.reader.getById(contract.id as number, todayInNicaragua(now))) as ContractDto;
  }
}
