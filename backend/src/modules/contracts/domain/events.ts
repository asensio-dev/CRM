import type { ContractStatus } from '@axiom/contracts';
import type { DomainEvent } from '../../../shared/domain';

export class ContractCreated implements DomainEvent {
  readonly name = 'contracts.created';
  constructor(
    readonly companyId: number,
    readonly createdById: number,
    readonly occurredAt: Date,
  ) {}
}

export class ContractStatusChanged implements DomainEvent {
  readonly name = 'contracts.status-changed';
  constructor(
    readonly companyId: number,
    readonly from: ContractStatus,
    readonly to: ContractStatus,
    readonly occurredAt: Date,
  ) {}
}
