import type { ContractDto, UpdateContractDraftCommand } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  UNIT_OF_WORK,
  type UnitOfWork,
  type UseCase,
} from '../../../../shared/application';
import {
  CONTRACT_READER,
  CONTRACT_REPOSITORY,
  type ContractReader,
  type ContractRepository,
  contractNotFound,
  todayInNicaragua,
} from '../../domain';
import { assertCanManage, type ContractActor } from '../actor';

export interface UpdateContractDraftInput {
  id: number;
  data: UpdateContractDraftCommand;
  actor: ContractActor;
}

/** Edita un contrato en BORRADOR (cualquier otro estado → 422 CONTRACT_NOT_DRAFT). */
@Injectable()
export class UpdateContractDraftUseCase implements UseCase<UpdateContractDraftInput, ContractDto> {
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(CONTRACT_READER) private readonly reader: ContractReader,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ id, data, actor }: UpdateContractDraftInput): Promise<ContractDto> {
    const now = this.clock.now();
    await this.uow.run(async () => {
      const contract = await this.contracts.findById(id);
      if (!contract) throw contractNotFound(id);
      assertCanManage(actor, contract);
      contract.updateDraft(data, now);
      await this.contracts.save(contract);
    });
    return (await this.reader.getById(id, todayInNicaragua(now))) as ContractDto;
  }
}
