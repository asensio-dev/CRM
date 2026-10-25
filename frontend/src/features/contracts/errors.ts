import { CONTRACT_STATUS_LABELS, PIPELINE_STATUS_LABELS } from '@axiom/contracts';
import { pipelineErrorMessage } from '@/features/pipeline/errors';
import { HttpError } from '@/shared/api';

function pipelineLabel(value: unknown): string {
  return typeof value === 'string' && value in PIPELINE_STATUS_LABELS
    ? PIPELINE_STATUS_LABELS[value as keyof typeof PIPELINE_STATUS_LABELS]
    : '?';
}

function contractLabel(value: unknown): string {
  return typeof value === 'string' && value in CONTRACT_STATUS_LABELS
    ? CONTRACT_STATUS_LABELS[value as keyof typeof CONTRACT_STATUS_LABELS]
    : String(value ?? '?');
}

/** Traduce los errores del API de contratos (y del pipeline que viaja con ellos) a español. */
export function contractErrorMessage(err: unknown): string {
  if (!(err instanceof HttpError)) return pipelineErrorMessage(err);
  const d = (err.details ?? {}) as { from?: unknown; to?: unknown };
  switch (err.code) {
    case 'CONTRACT_COMPANY_NOT_READY': {
      const current = d.from ? ` (hoy está en '${pipelineLabel(d.from)}')` : '';
      if (d.to === 'CONTRATO_ACTIVO') {
        return `La empresa debe estar en 'En proceso de contrato' para activar el contrato${current}. Marca el contrato como enviado primero.`;
      }
      return `La empresa debe estar en 'Agendando cita' o más avanzada para iniciar un contrato${current}. Agenda una cita con la empresa primero.`;
    }
    case 'CONTRACT_INVALID_TRANSITION':
      return `No se puede pasar el contrato de ${contractLabel(d.from)} a ${contractLabel(d.to)}. Se actualizó el detalle.`;
    case 'CONTRACT_NOT_DRAFT':
      return 'Solo se puede editar un contrato en borrador.';
    case 'CONTRACT_STATUS_SYSTEM_MANAGED':
      return "El estado 'Vencido' lo calcula el sistema; no se puede asignar manualmente.";
    case 'CONTRACT_ALREADY_EXPIRED':
      return 'El contrato ya venció (su fecha de fin pasó): no se puede activar.';
    case 'CONTRACT_INVALID_AMOUNT':
      return 'El monto debe ser un decimal no negativo con hasta 2 decimales.';
    case 'CONTRACT_INVALID_DATES':
      return 'La fecha de fin no puede ser anterior a la de inicio.';
    case 'CONTRACT_NOTES_TOO_LONG':
      return 'Las notas son demasiado largas (máximo 2000 caracteres).';
    case 'CONTRACT_FORBIDDEN':
      return 'Solo puedes gestionar los contratos que creaste.';
    case 'CONTRACT_NOT_FOUND':
      return 'El contrato no existe o fue eliminado.';
    case 'CONTRACT_CONCURRENT_UPDATE':
      return 'Otra persona modificó este contrato. Recarga e intenta de nuevo.';
    default:
      return pipelineErrorMessage(err);
  }
}
