/**
 * API pública de la feature `appointments`.
 *
 * - `ScheduleAppointmentDialog` props: `{ open; onOpenChange; companyId?; companyName?; onScheduled?(a) }`.
 *   Con `companyId` el selector de empresa queda fijo. Mapea APPOINTMENT_COMPANY_NOT_READY a español.
 * - Claves de caché: `appointmentKeys`. Las mutaciones invalidan citas, analytics y el pipeline de la empresa.
 */
export { AppointmentsPage } from './appointments-page';
export { appointmentKeys } from './queries';
export {
  ScheduleAppointmentDialog,
  type ScheduleAppointmentDialogProps,
} from './schedule-dialog';
