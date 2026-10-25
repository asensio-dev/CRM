import { DomainError } from '../../../shared/domain';

export const portfolioForbidden = (message = 'Solo ADMIN o SUPERVISOR pueden hacer esto') =>
  new DomainError('PORTFOLIO_FORBIDDEN', message, 'FORBIDDEN');

export const userNotFound = (userId: number) =>
  DomainError.notFound('PORTFOLIO_USER_NOT_FOUND', `No existe el usuario ${userId}`);

export const targetNotExecutive = (userId: number) =>
  new DomainError(
    'PORTFOLIO_TARGET_NOT_EXECUTIVE',
    `El usuario ${userId} no es un EJECUTIVO activo`,
    'RULE',
  );

export const noActiveCycle = () =>
  new DomainError(
    'PORTFOLIO_NO_ACTIVE_CYCLE',
    'No hay un ciclo de rotación abierto; ejecuta la rotación semanal',
    'RULE',
  );

export const assignmentNotFound = (id: number) =>
  DomainError.notFound('PORTFOLIO_ASSIGNMENT_NOT_FOUND', `No existe la asignación ${id}`);

export const assignmentAlreadyReleased = (id: number | null) =>
  new DomainError(
    'PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED',
    `La asignación ${id ?? ''} ya fue liberada`.trim(),
    'RULE',
  );
