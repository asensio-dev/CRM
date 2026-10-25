import type { InteractionChannel, InteractionOutcome } from '@axiom/contracts';
import type { DomainEvent } from '../../../../shared/domain';
import type { PipelineStatusCode } from '../value-objects/pipeline-status';

/** Una empresa cambió de estado en el pipeline (manual o automáticamente por una interacción). */
export class CompanyStatusChanged implements DomainEvent {
  static readonly NAME = 'pipeline.company-status-changed';
  readonly name = CompanyStatusChanged.NAME;

  constructor(
    readonly companyId: number,
    readonly from: PipelineStatusCode,
    readonly to: PipelineStatusCode,
    readonly userId: number,
    readonly occurredAt: Date,
  ) {}
}

/** Se registró un contacto con la empresa (p. ej. `portfolio` marca el ítem del plan como contactado). */
export class InteractionRegistered implements DomainEvent {
  static readonly NAME = 'pipeline.interaction-registered';
  readonly name = InteractionRegistered.NAME;

  constructor(
    readonly companyId: number,
    readonly userId: number,
    readonly channel: InteractionChannel,
    readonly outcome: InteractionOutcome,
    readonly planItemId: number | null,
    readonly occurredAt: Date,
  ) {}
}
