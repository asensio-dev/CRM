import { pipelineErrorMessage } from '@/features/pipeline/errors';
import { HttpError } from '@/shared/api';

/** Traduce los errores del API de citas (y del pipeline que viaja con ellas) a español. */
export function appointmentErrorMessage(err: unknown): string {
  if (!(err instanceof HttpError)) return pipelineErrorMessage(err);
  switch (err.code) {
    case 'APPOINTMENT_COMPANY_NOT_READY':
      return "La empresa debe estar en 'Con respuesta' para agendar una cita. Registra primero un contacto con respuesta (o mueve la empresa en el pipeline) y vuelve a intentarlo.";
    case 'APPOINTMENT_DATE_IN_PAST':
      return 'La fecha y hora de la cita deben ser futuras.';
    case 'APPOINTMENT_LOCATION_REQUIRED':
      return 'Indica el lugar de la cita: es obligatorio en citas presenciales.';
    case 'APPOINTMENT_FORBIDDEN':
      return 'Solo puedes gestionar tus propias citas.';
    case 'APPOINTMENT_NOT_FOUND':
      return 'La cita no existe o fue eliminada.';
    case 'APPOINTMENT_NOT_SCHEDULED':
      return 'La cita ya no está programada (fue realizada, cancelada o reprogramada). Se actualizó la lista.';
    case 'APPOINTMENT_OUTCOME_REQUIRED':
      return 'Indica el resultado de la reunión para completarla.';
    case 'APPOINTMENT_NOTES_TOO_LONG':
      return 'Las notas son demasiado largas (máximo 2000 caracteres en total).';
    case 'APPOINTMENT_LOCATION_TOO_LONG':
      return 'El lugar es demasiado largo (máximo 300 caracteres).';
    case 'APPOINTMENT_CONCURRENT_UPDATE':
      return 'Otra persona modificó esta cita. Recarga e intenta de nuevo.';
    case 'APPOINTMENT_REFERENCE_NOT_FOUND':
      return 'La empresa o el usuario indicado no existe.';
    default:
      return pipelineErrorMessage(err);
  }
}
