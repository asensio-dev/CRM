import { DomainError } from '../../../shared/domain';

export const companyNotFound = (companyId: number) =>
  DomainError.notFound('PIPELINE_COMPANY_NOT_FOUND', `No existe la empresa ${companyId}`);

export const concurrentUpdate = () =>
  DomainError.conflict(
    'PIPELINE_CONCURRENT_UPDATE',
    'La empresa fue modificada a la vez por otro usuario; recarga y vuelve a intentarlo',
  );
