import { DomainError } from '../../../shared/domain';

export const contractNotFound = (id: number) =>
  DomainError.notFound('CONTRACT_NOT_FOUND', `No existe el contrato ${id}`);

export const contractForbidden = () =>
  new DomainError(
    'CONTRACT_FORBIDDEN',
    'Un ejecutivo solo puede gestionar los contratos que creó',
    'FORBIDDEN',
  );

export const concurrentContractUpdate = () =>
  DomainError.conflict(
    'CONTRACT_CONCURRENT_UPDATE',
    'El contrato fue modificado por otro usuario; recarga y vuelve a intentarlo',
  );

/** La empresa está en un estado del pipeline desde el que no se puede avanzar el contrato. */
export const companyNotReadyForContract = (details: unknown) =>
  new DomainError(
    'CONTRACT_COMPANY_NOT_READY',
    'La empresa no está en un estado del pipeline compatible con esta operación del contrato',
    'RULE',
    details,
  );
