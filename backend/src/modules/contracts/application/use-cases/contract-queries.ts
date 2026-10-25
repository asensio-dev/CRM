import type { ContractDto, ListContractsQuery, Paginated } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/application';
import {
  CONTRACT_READER,
  type ContractReader,
  contractForbidden,
  contractNotFound,
  todayInNicaragua,
} from '../../domain';
import { type ContractActor, isPrivileged } from '../actor';

/** Lista contratos; un EJECUTIVO solo ve los que creó. El estado se evalúa con la regla de vencimiento. */
@Injectable()
export class ListContractsUseCase {
  constructor(
    @Inject(CONTRACT_READER) private readonly reader: ContractReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({
    query,
    actor,
  }: {
    query: ListContractsQuery;
    actor: ContractActor;
  }): Promise<Paginated<ContractDto>> {
    return this.reader.list({
      ...query,
      createdById: isPrivileged(actor) ? undefined : actor.userId,
      today: todayInNicaragua(this.clock.now()),
    });
  }
}

@Injectable()
export class GetContractUseCase {
  constructor(
    @Inject(CONTRACT_READER) private readonly reader: ContractReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ id, actor }: { id: number; actor: ContractActor }): Promise<ContractDto> {
    const dto = await this.reader.getById(id, todayInNicaragua(this.clock.now()));
    if (!dto) throw contractNotFound(id);
    if (!isPrivileged(actor) && dto.createdById !== actor.userId) throw contractForbidden();
    return dto;
  }
}
