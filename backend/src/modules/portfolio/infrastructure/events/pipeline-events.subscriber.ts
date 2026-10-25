import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { safeErrorLog } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { CompanyStatusChanged, InteractionRegistered } from '../../../pipeline';
import {
  MarkPlanItemContactedUseCase,
  ReleaseOnStatusChangeUseCase,
} from '../../application/use-cases/pipeline-reactions.use-case';

/**
 * Observer de los eventos del pipeline (se publican tras confirmar su transacción).
 * Un fallo aquí no debe romper la operación del pipeline ya confirmada: se registra y se sigue.
 */
@Injectable()
export class PipelineEventsSubscriber {
  private readonly logger = new Logger(PipelineEventsSubscriber.name);

  constructor(
    private readonly markContacted: MarkPlanItemContactedUseCase,
    private readonly releaseOnStatus: ReleaseOnStatusChangeUseCase,
  ) {}

  @OnEvent(InteractionRegistered.NAME)
  async onInteraction(event: InteractionRegistered): Promise<void> {
    try {
      await this.markContacted.execute({
        companyId: event.companyId,
        planItemId: event.planItemId,
        occurredAt: event.occurredAt,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo marcar el plan de la empresa ${event.companyId}`,
        safeErrorLog(error),
      );
    }
  }

  @OnEvent(CompanyStatusChanged.NAME)
  async onStatusChanged(event: CompanyStatusChanged): Promise<void> {
    try {
      await this.releaseOnStatus.execute({
        companyId: event.companyId,
        to: event.to,
        occurredAt: event.occurredAt,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo liberar la asignación de la empresa ${event.companyId}`,
        safeErrorLog(error),
      );
    }
  }
}
