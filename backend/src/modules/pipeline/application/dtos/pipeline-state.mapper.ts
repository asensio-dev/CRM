import type { PipelineStateDto, UserRole } from '@axiom/contracts';
import type { CompanyPipeline } from '../../domain';

export function toPipelineStateDto(pipeline: CompanyPipeline, role: UserRole): PipelineStateDto {
  return {
    companyId: pipeline.companyId,
    status: pipeline.status.value,
    version: pipeline.version,
    lastContactAt: pipeline.lastContactAt?.toISOString() ?? null,
    allowedNextStatuses: pipeline.allowedNextStatuses(role),
  };
}
