import type { ContractDto, ContractStatus } from '@axiom/contracts';
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
  type Contract,
  type ContractReader,
  type ContractRepository,
  contractNotFound,
  todayInNicaragua,
} from '../../domain';
import { assertCanManage, type ContractActor } from '../actor';

export interface ChangeContractStatusInput {
  id: number;
  to: ContractStatus;
  actor: ContractActor;
}

/**
 * Cambia el estado del contrato (la regla vive en `Contract`) y sincroniza el pipeline:
 *  - ENVIADO: asegura EN_PROCESO_CONTRATO (no-op si ya está; cubre empresas devueltas a AGENDANDO_CITA).
 *  - ACTIVO: mueve la empresa a CONTRATO_ACTIVO (no-op si ya lo está).
 *  - FIRMADO / CANCELADO: no tocan el pipeline.
 * Un rechazo del pipeline revierte también el cambio del contrato (misma transacción).
 */
@Injectable()
export class ChangeContractStatusUseCase
  implements UseCase<ChangeContractStatusInput, ContractDto>
{
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(CONTRACT_READER) private readonly reader: ContractReader,
    @Inject(COMPANY_PIPELINE_GATEWAY) private readonly pipeline: CompanyPipelineGateway,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ id, to, actor }: ChangeContractStatusInput): Promise<ContractDto> {
    const now = this.clock.now();
    const today = todayInNicaragua(now);
    const contract: Contract = await this.uow.run(async () => {
      const found = await this.contracts.findById(id);
      if (!found) throw contractNotFound(id);
      assertCanManage(actor, found);
      found.changeStatus(to, today, now);
      if (to === 'ENVIADO') {
        await this.pipeline.advance({
          companyId: found.companyId,
          target: 'EN_PROCESO_CONTRATO',
          tolerated: ['EN_PROCESO_CONTRATO', 'CONTRATO_ACTIVO'],
          actor,
          note: `Contrato ${found.code} enviado`,
        });
      } else if (to === 'ACTIVO') {
        await this.pipeline.advance({
          companyId: found.companyId,
          target: 'CONTRATO_ACTIVO',
          tolerated: ['CONTRATO_ACTIVO'],
          actor,
          note: `Contrato ${found.code} activo`,
        });
      }
      await this.contracts.save(found);
      return found;
    });
    await this.events.publishAll(contract.pullEvents());
    return (await this.reader.getById(id, today)) as ContractDto;
  }
}
