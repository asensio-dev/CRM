import { z } from 'zod';

export const PLAN_ITEM_REASONS = ['SEGUIMIENTO', 'NUEVA', 'REINTENTO', 'ROTACION'] as const;
export const PlanItemReasonSchema = z.enum(PLAN_ITEM_REASONS);
export type PlanItemReason = z.infer<typeof PlanItemReasonSchema>;

export const RELEASE_REASONS = [
  'SIN_AVANCE',
  'REASIGNACION_MANUAL',
  'CONTRATO_ACTIVO',
  'DESCARTADO',
] as const;
export const ReleaseReasonSchema = z.enum(RELEASE_REASONS);
export type ReleaseReason = z.infer<typeof ReleaseReasonSchema>;

/** Claves de la tabla `settings` y sus valores por defecto (los inserta el seed). */
export const SETTING_DEFAULTS = {
  ROTATION_CYCLE_WEEKS: { value: '3', description: 'Semanas por ciclo de rotación' },
  WEEKLY_CONTACT_QUOTA: {
    value: '20',
    description: 'Contactos mínimos por ejecutivo y semana',
  },
  MAX_CYCLES_WITHOUT_PROGRESS: {
    value: '2',
    description: 'Ciclos sin avance antes de devolver la empresa al pool',
  },
  TIMEZONE: { value: 'America/Managua', description: 'Zona horaria del negocio' },
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;
