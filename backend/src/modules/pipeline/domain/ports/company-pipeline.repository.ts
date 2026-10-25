import type { CompanyPipeline } from '../entities/company-pipeline';

/**
 * Puerto de persistencia del agregado. `save` es atómico respecto a la transacción en curso
 * (UnitOfWork) y aplica bloqueo optimista sobre `companies.version`:
 * si otra escritura llegó antes lanza DomainError CONFLICT `PIPELINE_CONCURRENT_UPDATE`.
 */
export interface CompanyPipelineRepository {
  findById(companyId: number): Promise<CompanyPipeline | null>;
  save(pipeline: CompanyPipeline): Promise<void>;
}

export const COMPANY_PIPELINE_REPOSITORY = Symbol('CompanyPipelineRepository');
export const OUTCOME_POLICY = Symbol('OutcomePolicy');
