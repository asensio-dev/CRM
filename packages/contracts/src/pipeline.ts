import { z } from 'zod';

/**
 * Valores válidos del pipeline. Deben coincidir con el CHECK `companies_status_check`
 * de la migración inicial. Las transiciones permitidas las decide el dominio del backend
 * (módulo pipeline); el frontend las recibe por API, no las duplica.
 */
export const PIPELINE_STATUSES = [
  'POR_CONTACTAR',
  'CONTACTADO',
  'SIN_RESPUESTA',
  'CON_RESPUESTA',
  'AGENDANDO_CITA',
  'EN_PROCESO_CONTRATO',
  'CONTRATO_ACTIVO',
  'DESCARTADO',
] as const;

export const PipelineStatusSchema = z.enum(PIPELINE_STATUSES);
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  POR_CONTACTAR: 'Por contactar',
  CONTACTADO: 'Contactado',
  SIN_RESPUESTA: 'Sin respuesta',
  CON_RESPUESTA: 'Con respuesta',
  AGENDANDO_CITA: 'Agendando cita',
  EN_PROCESO_CONTRATO: 'En proceso de contrato',
  CONTRATO_ACTIVO: 'Contrato activo',
  DESCARTADO: 'Descartado',
};

export const INTERACTION_CHANNELS = ['LLAMADA', 'WHATSAPP', 'CORREO', 'VISITA', 'OTRO'] as const;
export const InteractionChannelSchema = z.enum(INTERACTION_CHANNELS);
export type InteractionChannel = z.infer<typeof InteractionChannelSchema>;

export const INTERACTION_OUTCOMES = [
  'CONTESTO',
  'NO_CONTESTO',
  'NUMERO_EQUIVOCADO',
  'INTERESADO',
  'NO_INTERESADO',
  'VOLVER_A_LLAMAR',
] as const;
export const InteractionOutcomeSchema = z.enum(INTERACTION_OUTCOMES);
export type InteractionOutcome = z.infer<typeof InteractionOutcomeSchema>;

// ───────────────────────────── API del módulo pipeline ─────────────────────────────
/**
 *   GET  /api/pipeline/companies/:id               → PipelineStateDto
 *   GET  /api/pipeline/companies/:id/timeline      ?page&pageSize → Paginated<TimelineEntryDto>
 *   GET  /api/pipeline/board                       BoardQuery → BoardDto
 *   POST /api/pipeline/companies/:id/status        ChangeStatusRequest → PipelineStateDto
 *   POST /api/pipeline/companies/:id/interactions  RegisterInteractionRequest → RegisterInteractionResultDto
 *
 * Errores: 422 PIPELINE_INVALID_TRANSITION (details {from, to, allowed}),
 * 403 PIPELINE_REACTIVATION_FORBIDDEN, 400 PIPELINE_NOTE_REQUIRED,
 * 409 PIPELINE_CONCURRENT_UPDATE / PIPELINE_VERSION_MISMATCH, 404 PIPELINE_COMPANY_NOT_FOUND.
 */

/** Estado al que solo se llega con una nota (motivo). */
export const PIPELINE_STATUSES_REQUIRING_NOTE: readonly PipelineStatus[] = ['DESCARTADO'];

/** Fecha ISO 8601 con zona (`2026-10-24T15:00:00Z` o `…-06:00`) convertida a Date. */
const IsoDateSchema = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const IdSchema = z.coerce.number().int().positive();

export const ChangeStatusSchema = z.object({
  to: PipelineStatusSchema,
  /** Obligatoria para pasar a DESCARTADO (motivo). */
  note: z.string().trim().min(1).max(1000).optional(),
  /** Versión que vio el cliente; si no coincide → 409 PIPELINE_VERSION_MISMATCH. */
  expectedVersion: z.number().int().min(0).optional(),
});
export type ChangeStatusRequest = z.input<typeof ChangeStatusSchema>;
export type ChangeStatusCommand = z.output<typeof ChangeStatusSchema>;

export const RegisterInteractionSchema = z.object({
  channel: InteractionChannelSchema,
  outcome: InteractionOutcomeSchema,
  notes: z.string().trim().min(1).max(2000).optional(),
  /** Por defecto, ahora. */
  occurredAt: IsoDateSchema.optional(),
  nextFollowUpAt: IsoDateSchema.optional(),
  /** Ítem del plan semanal que se está gestionando (solo se guarda). */
  planItemId: IdSchema.optional(),
  /** Estado final deseado: se aplica tras la política automática y lo valida la máquina de estados. */
  targetStatus: PipelineStatusSchema.optional(),
  /** Nota del cambio a `targetStatus` (si falta se usa `notes`). */
  statusNote: z.string().trim().min(1).max(1000).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});
export type RegisterInteractionRequest = z.input<typeof RegisterInteractionSchema>;
export type RegisterInteractionCommand = z.output<typeof RegisterInteractionSchema>;

export interface PipelineStateDto {
  companyId: number;
  status: PipelineStatus;
  version: number;
  lastContactAt: string | null;
  /** Destinos válidos desde el estado actual para el usuario que consulta (los decide el backend). */
  allowedNextStatuses: PipelineStatus[];
}

export interface StatusTransitionDto {
  from: PipelineStatus;
  to: PipelineStatus;
}

export interface RegisterInteractionResultDto {
  state: PipelineStateDto;
  /** Transiciones aplicadas (automáticas + explícita), en orden. */
  transitions: StatusTransitionDto[];
}

export interface TimelineUserDto {
  id: number;
  fullName: string;
}

export type TimelineEntryDto =
  | {
      type: 'INTERACTION';
      id: number;
      occurredAt: string;
      user: TimelineUserDto;
      channel: InteractionChannel;
      outcome: InteractionOutcome;
      notes: string | null;
      nextFollowUpAt: string | null;
      planItemId: number | null;
    }
  | {
      type: 'STATUS_CHANGE';
      id: number;
      occurredAt: string;
      user: TimelineUserDto;
      fromStatus: PipelineStatus | null;
      toStatus: PipelineStatus;
      note: string | null;
    };

export const BoardQuerySchema = z.object({
  sectorId: IdSchema.optional(),
  activityId: IdSchema.optional(),
  /** Busca en razón social, nombre comercial y RUC. */
  q: z.string().trim().min(1).max(100).optional(),
  limitPerColumn: z.coerce.number().int().min(1).max(100).default(20),
});
export type BoardQuery = z.output<typeof BoardQuerySchema>;

export interface BoardCardDto {
  id: number;
  legalName: string;
  tradeName: string | null;
  phone: string | null;
  employeeCount: number;
  lastContactAt: string | null;
}

export interface BoardColumnDto {
  status: PipelineStatus;
  /** Total de empresas en el estado (con los filtros), no solo las tarjetas devueltas. */
  count: number;
  cards: BoardCardDto[];
}

export interface BoardDto {
  columns: BoardColumnDto[];
}
