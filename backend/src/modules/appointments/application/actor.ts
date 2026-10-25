import type { UserRole } from '@axiom/contracts';
import { type Appointment, appointmentForbidden } from '../domain';

export interface AppointmentActor {
  userId: number;
  role: UserRole;
}

export const isPrivileged = (actor: AppointmentActor): boolean =>
  actor.role === 'ADMIN' || actor.role === 'SUPERVISOR';

/** EJECUTIVO: solo sus citas. SUPERVISOR / ADMIN: todas. */
export function assertCanManage(actor: AppointmentActor, appointment: Appointment): void {
  if (!isPrivileged(actor) && appointment.userId !== actor.userId) throw appointmentForbidden();
}
