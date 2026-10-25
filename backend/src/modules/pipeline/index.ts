// API pública del módulo pipeline (lo único que otros módulos pueden importar).
export type { CompanyAccessPolicy } from './application/ports/company-access-policy';
export {
  AllowAllCompanyAccessPolicy,
  assertCanOperate,
  COMPANY_ACCESS_POLICY,
} from './application/ports/company-access-policy';
export type { ChangeCompanyStatusInput } from './application/use-cases/change-company-status.use-case';
export { ChangeCompanyStatusUseCase } from './application/use-cases/change-company-status.use-case';
export type { RegisterInteractionUseCaseInput } from './application/use-cases/register-interaction.use-case';
export { RegisterInteractionUseCase } from './application/use-cases/register-interaction.use-case';
export type { Actor } from './domain/entities/company-pipeline';
export { CompanyStatusChanged, InteractionRegistered } from './domain/events/pipeline-events';
export { PipelineModule } from './pipeline.module';
