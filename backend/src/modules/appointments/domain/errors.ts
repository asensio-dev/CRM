import { DomainError } from '../../../shared/domain';

export const appointmentNotFound = (id: number) =>
  DomainError.notFound('APPOINTMENT_NOT_FOUND', `No existe la cita ${id}`);

export const appointmentForbidden = () =>
  new DomainError(
    'APPOINTMENT_FORBIDDEN',
    'Un ejecutivo solo puede gestionar sus propias citas',
    'FORBIDDEN',
  );

export const concurrentAppointmentUpdate = () =>
  DomainError.conflict(
    'APPOINTMENT_CONCURRENT_UPDATE',
    'La cita fue modificada por otro usuario; recarga y vuelve a intentarlo',
  );

/** La empresa está en un estado del pipeline desde el que no se puede agendar. */
export const companyNotReadyForAppointment = (details: unknown) =>
  new DomainError(
    'APPOINTMENT_COMPANY_NOT_READY',
    'Solo se puede agendar una cita con una empresa CON_RESPUESTA (o ya en AGENDANDO_CITA o posterior)',
    'RULE',
    details,
  );
