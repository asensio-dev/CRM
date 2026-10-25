import { PIPELINE_STATUS_LABELS, type PipelineStatus } from '@axiom/contracts';
import { HttpError } from '@/shared/api';

function statusLabel(value: unknown): string {
  return typeof value === 'string' && value in PIPELINE_STATUS_LABELS
    ? PIPELINE_STATUS_LABELS[value as PipelineStatus]
    : String(value ?? '?');
}

/** Códigos que indican que el cliente tenía datos viejos: conviene refrescar. */
export function isConcurrencyError(err: unknown): boolean {
  return (
    err instanceof HttpError &&
    (err.code === 'PIPELINE_CONCURRENT_UPDATE' || err.code === 'PIPELINE_VERSION_MISMATCH')
  );
}

/** Traduce un error de la API del pipeline a un mensaje amable en español. */
export function pipelineErrorMessage(err: unknown): string {
  if (!(err instanceof HttpError)) return 'Ocurrió un error inesperado. Intenta de nuevo.';
  switch (err.code) {
    case 'PIPELINE_INVALID_TRANSITION': {
      const d = (err.details ?? {}) as { from?: unknown; to?: unknown; allowed?: unknown };
      const allowed = Array.isArray(d.allowed) ? d.allowed.map(statusLabel).join(', ') : '';
      const base = `No se puede pasar de "${statusLabel(d.from)}" a "${statusLabel(d.to)}".`;
      return allowed ? `${base} Estados permitidos: ${allowed}.` : base;
    }
    case 'PIPELINE_NOTE_REQUIRED':
      return 'Debes indicar un motivo (nota) para este cambio de estado.';
    case 'PIPELINE_REACTIVATION_FORBIDDEN':
      return 'Solo un administrador o supervisor puede reactivar una empresa descartada.';
    case 'PORTFOLIO_COMPANY_NOT_ASSIGNED':
      return 'Esta empresa no está asignada a tu cartera.';
    case 'PIPELINE_CONCURRENT_UPDATE':
    case 'PIPELINE_VERSION_MISMATCH':
      return 'Otra persona actualizó esta empresa. Se recargaron los datos; revisa e intenta de nuevo.';
    case 'PIPELINE_COMPANY_NOT_FOUND':
      return 'La empresa no existe o fue eliminada.';
    case 'NETWORK_ERROR':
      return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    default:
      if (err.statusCode === 403) return 'No tienes permiso para realizar esta acción.';
      return err.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}
