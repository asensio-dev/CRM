import type {
  InteractionChannel,
  InteractionOutcome,
  RegisterInteractionResultDto,
} from '@axiom/contracts';
import { Inject, Injectable, Optional } from '@nestjs/common';
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
  type Actor,
  COMPANY_PIPELINE_REPOSITORY,
  type CompanyPipelineRepository,
  companyNotFound,
  OUTCOME_POLICY,
  type OutcomePolicy,
  type PipelineStatusCode,
} from '../../domain';
import { toPipelineStateDto } from '../dtos/pipeline-state.mapper';
import {
  AllowAllCompanyAccessPolicy,
  assertCanOperate,
  COMPANY_ACCESS_POLICY,
  type CompanyAccessPolicy,
} from '../ports/company-access-policy';

export interface RegisterInteractionUseCaseInput {
  companyId: number;
  actor: Actor;
  channel: InteractionChannel;
  outcome: InteractionOutcome;
  notes?: string | null;
  /** Por defecto, ahora (Clock). */
  occurredAt?: Date | null;
  nextFollowUpAt?: Date | null;
  planItemId?: number | null;
  targetStatus?: PipelineStatusCode | null;
  statusNote?: string | null;
  expectedVersion?: number | null;
}

/**
 * Registra una interacción y aplica la política de resultados en una sola transacción:
 * interacción + historial de estados + actualización de `companies` (con bloqueo optimista).
 * Los eventos se publican solo después de confirmar.
 */
@Injectable()
export class RegisterInteractionUseCase
  implements UseCase<RegisterInteractionUseCaseInput, RegisterInteractionResultDto>
{
  constructor(
    @Inject(COMPANY_PIPELINE_REPOSITORY) private readonly pipelines: CompanyPipelineRepository,
    @Inject(OUTCOME_POLICY) private readonly policy: OutcomePolicy,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional()
    @Inject(COMPANY_ACCESS_POLICY)
    private readonly access: CompanyAccessPolicy = new AllowAllCompanyAccessPolicy(),
  ) {}

  async execute(input: RegisterInteractionUseCaseInput): Promise<RegisterInteractionResultDto> {
    await assertCanOperate(this.access, input.actor, input.companyId);
    const now = this.clock.now();
    const { pipeline, transitions } = await this.uow.run(async () => {
      const found = await this.pipelines.findById(input.companyId);
      if (!found) throw companyNotFound(input.companyId);
      found.assertVersion(input.expectedVersion);
      const result = found.registerInteraction(
        {
          channel: input.channel,
          outcome: input.outcome,
          notes: input.notes,
          occurredAt: input.occurredAt ?? now,
          nextFollowUpAt: input.nextFollowUpAt,
          planItemId: input.planItemId,
          targetStatus: input.targetStatus,
          statusNote: input.statusNote,
        },
        input.actor,
        this.policy,
        now,
      );
      await this.pipelines.save(found);
      return { pipeline: found, transitions: result.transitions };
    });
    await this.events.publishAll(pipeline.pullEvents());
    return { state: toPipelineStateDto(pipeline, input.actor.role), transitions };
  }
}
