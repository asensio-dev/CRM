import { z } from 'zod';

/** Deben coincidir con los CHECK `appointments_mode_check` / `appointments_status_check`. */
export const APPOINTMENT_MODES = ['PRESENCIAL', 'VIRTUAL', 'TELEFONICA'] as const;
export const AppointmentModeSchema = z.enum(APPOINTMENT_MODES);
export type AppointmentMode = z.infer<typeof AppointmentModeSchema>;

export const APPOINTMENT_STATUSES = [
  'PROGRAMADA',
  'REALIZADA',
  'CANCELADA',
  'REPROGRAMADA',
] as const;
export const AppointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PROGRAMADA: 'Programada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
  REPROGRAMADA: 'Reprogramada',
};

// ───────────────────────────── API del módulo appointments ─────────────────────────────
/**
 *   GET  /api/appointments                 ListAppointmentsQuery → Paginated<AppointmentDto>
 *   GET  /api/appointments/agenda          ?from&to&userId → AppointmentDto[] (rango [from, to), orden ascendente)
 *   POST /api/appointments                 ScheduleAppointmentRequest → AppointmentDto (201)
 *   POST /api/appointments/:id/reschedule  RescheduleAppointmentRequest → RescheduleResultDto
 *   POST /api/appointments/:id/complete    CompleteAppointmentRequest → AppointmentDto
 *   POST /api/appointments/:id/cancel      CancelAppointmentRequest → AppointmentDto
 *
 * Errores: 400 APPOINTMENT_DATE_IN_PAST / APPOINTMENT_LOCATION_REQUIRED, 403 APPOINTMENT_FORBIDDEN,
 * 404 APPOINTMENT_NOT_FOUND, 422 APPOINTMENT_NOT_SCHEDULED / APPOINTMENT_COMPANY_NOT_READY (details {from,to,allowed}).
 */

const IsoDateTimeSchema = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const IdSchema = z.coerce.number().int().positive();
const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const ScheduleAppointmentSchema = z.object({
  companyId: z.number().int().positive(),
  scheduledAt: IsoDateTimeSchema,
  mode: AppointmentModeSchema,
  /** Obligatoria si `mode` es PRESENCIAL. */
  location: trimmed(300).optional(),
  notes: trimmed(2000).optional(),
  /** Solo ADMIN/SUPERVISOR pueden agendar para otro usuario; por defecto, el autenticado. */
  userId: z.number().int().positive().optional(),
});
export type ScheduleAppointmentRequest = z.input<typeof ScheduleAppointmentSchema>;
export type ScheduleAppointmentCommand = z.output<typeof ScheduleAppointmentSchema>;

export const RescheduleAppointmentSchema = z.object({
  scheduledAt: IsoDateTimeSchema,
  mode: AppointmentModeSchema.optional(),
  location: trimmed(300).optional(),
  notes: trimmed(2000).optional(),
});
export type RescheduleAppointmentRequest = z.input<typeof RescheduleAppointmentSchema>;
export type RescheduleAppointmentCommand = z.output<typeof RescheduleAppointmentSchema>;

export const CompleteAppointmentSchema = z.object({
  /** Resultado de la reunión (obligatorio). */
  outcome: trimmed(1500),
});
export type CompleteAppointmentRequest = z.input<typeof CompleteAppointmentSchema>;

export const CancelAppointmentSchema = z.object({
  reason: trimmed(1000).optional(),
});
export type CancelAppointmentRequest = z.input<typeof CancelAppointmentSchema>;

const MAX_AGENDA_DAYS = 62;

export const ListAppointmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    userId: IdSchema.optional(),
    companyId: IdSchema.optional(),
    status: AppointmentStatusSchema.optional(),
    /** Inicio inclusivo (ISO 8601 con zona). */
    from: IsoDateTimeSchema.optional(),
    /** Fin exclusivo (ISO 8601 con zona). */
    to: IsoDateTimeSchema.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, {
    message: '`from` debe ser anterior a `to`',
    path: ['to'],
  });
export type ListAppointmentsQuery = z.output<typeof ListAppointmentsQuerySchema>;

export const AgendaQuerySchema = z
  .object({
    from: IsoDateTimeSchema,
    to: IsoDateTimeSchema,
    userId: IdSchema.optional(),
  })
  .refine((q) => q.from < q.to, { message: '`from` debe ser anterior a `to`', path: ['to'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= MAX_AGENDA_DAYS * 86_400_000, {
    message: `El rango de la agenda no puede superar ${MAX_AGENDA_DAYS} días`,
    path: ['to'],
  });
export type AgendaQuery = z.output<typeof AgendaQuerySchema>;

export interface AppointmentDto {
  id: number;
  companyId: number;
  companyName: string | null;
  userId: number;
  scheduledAt: string;
  mode: AppointmentMode;
  location: string | null;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RescheduleResultDto {
  /** La cita original, ya en estado REPROGRAMADA. */
  previous: AppointmentDto;
  /** La nueva cita PROGRAMADA con la fecha nueva. */
  appointment: AppointmentDto;
}
