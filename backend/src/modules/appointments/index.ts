// API pública del módulo appointments. Otros módulos solo pueden importar desde aquí.
export { AppointmentsModule } from './appointments.module';
export {
  AppointmentCancelled,
  AppointmentCompleted,
  AppointmentRescheduled,
  AppointmentScheduled,
} from './domain/events';
