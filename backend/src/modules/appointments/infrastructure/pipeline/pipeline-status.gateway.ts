import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain';
import { ChangeCompanyStatusUseCase } from '../../../pipeline';
import {
  type AdvanceCompanyInput,
  type CompanyPipelineGateway,
  companyNotReadyForAppointment,
} from '../../domain';

/**
 * Adaptador al módulo pipeline usando SOLO su API pública (`ChangeCompanyStatusUseCase`).
 * Como la API pública no expone una lectura del estado, se intenta la transición y se interpreta el
 * rechazo: `PIPELINE_INVALID_TRANSITION` desde un estado tolerado = "ya estaba ahí" (sin cambio);
 * desde cualquier otro estado = la empresa no está lista (RULE con {from,to,allowed}).
 * Cualquier otro error (404 empresa inexistente, 409 concurrencia, 403…) se propaga tal cual.
 */
@Injectable()
export class PipelineStatusGateway implements CompanyPipelineGateway {
  constructor(private readonly changeStatus: ChangeCompanyStatusUseCase) {}

  async advance(input: AdvanceCompanyInput): Promise<{ moved: boolean }> {
    try {
      await this.changeStatus.execute({
        companyId: input.companyId,
        to: input.target,
        note: input.note ?? null,
        actor: input.actor,
      });
      return { moved: true };
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== 'PIPELINE_INVALID_TRANSITION')
        throw error;
      const from = (error.details as { from?: string } | undefined)?.from;
      if (from && (input.tolerated as readonly string[]).includes(from)) return { moved: false };
      throw companyNotReadyForAppointment(error.details);
    }
  }
}
