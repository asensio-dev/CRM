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
