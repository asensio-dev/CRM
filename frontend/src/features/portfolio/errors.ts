import { HttpError } from '@/shared/api';

/** Traduce un error del API de cartera a un mensaje amable en español. */
export function portfolioErrorMessage(err: unknown): string {
  if (!(err instanceof HttpError)) return 'Ocurrió un error inesperado. Intenta de nuevo.';
  switch (err.code) {
    case 'PORTFOLIO_FORBIDDEN':
      return 'No tienes permiso para realizar esta acción en la cartera.';
    case 'PORTFOLIO_TARGET_NOT_EXECUTIVE':
      return 'El usuario destino no es un ejecutivo activo. Elige a otro.';
    case 'PORTFOLIO_NO_ACTIVE_CYCLE':
      return 'No hay un ciclo de rotación activo. Un administrador debe ejecutar la rotación semanal.';
    case 'PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED':
      return 'Esa asignación ya había sido liberada. Se actualizó la lista.';
    case 'PORTFOLIO_ASSIGNMENT_NOT_FOUND':
      return 'La asignación no existe o fue eliminada.';
    case 'PORTFOLIO_USER_NOT_FOUND':
      return 'El usuario indicado no existe.';
    case 'PORTFOLIO_COMPANY_NOT_ASSIGNED':
      return 'Esta empresa no está asignada a tu cartera.';
    case 'NETWORK_ERROR':
      return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    default:
      if (err.statusCode === 403) return 'No tienes permiso para realizar esta acción.';
      return err.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}
