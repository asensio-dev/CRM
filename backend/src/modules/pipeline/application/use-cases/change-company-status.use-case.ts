import type { PipelineStateDto } from '@axiom/contracts';
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
  type Actor,
  COMPANY_PIPELINE_REPOSITORY,
  type CompanyPipelineRepository,
  companyNotFound,
  type PipelineStatusCode,
} from '../../domain';
import { toPipelineStateDto } from '../dtos/pipeline-state.mapper';

export interface ChangeCompanyStatusInput {
  companyId: number;
  to: PipelineStatusCode;
  note?: string | null;
  expectedVersion?: number | null;
  actor: Actor;
}

/** Cambio explícito de estado (p. ej. arrastrar una tarjeta en el kanban). */
@Injectable()
export class ChangeCompanyStatusUseCase
  implements UseCase<ChangeCompanyStatusInput, PipelineStateDto>
{
  constructor(
    @Inject(COMPANY_PIPELINE_REPOSITORY) private readonly pipelines: CompanyPipelineRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ChangeCompanyStatusInput): Promise<PipelineStateDto> {
    const pipeline = await this.uow.run(async () => {
      const found = await this.pipelines.findById(input.companyId);
      if (!found) throw companyNotFound(input.companyId);
      found.assertVersion(input.expectedVersion);
      found.changeStatus(input.to, input.actor, input.note, this.clock.now());
      await this.pipelines.save(found);
      return found;
    });
    await this.events.publishAll(pipeline.pullEvents());
    return toPipelineStateDto(pipeline, input.actor.role);
  }
}
