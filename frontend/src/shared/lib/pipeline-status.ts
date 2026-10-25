import { PIPELINE_STATUS_LABELS, PIPELINE_STATUSES, type PipelineStatus } from '@axiom/contracts';

export interface StatusStyle {
  label: string;
  /** Clases del badge (fondo suave + texto + borde). Reutilizable por el kanban. */
  badge: string;
  /** Punto / barra de color sólido (cabecera de columna del kanban). */
  dot: string;
}

const STYLES: Record<PipelineStatus, Omit<StatusStyle, 'label'>> = {
  POR_CONTACTAR: {
    badge:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30',
    dot: 'bg-slate-400',
  },
  CONTACTADO: {
    badge:
      'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
    dot: 'bg-sky-500',
  },
  SIN_RESPUESTA: {
    badge:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    dot: 'bg-amber-500',
  },
  CON_RESPUESTA: {
    badge:
      'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30',
    dot: 'bg-teal-500',
  },
  AGENDANDO_CITA: {
    badge:
      'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30',
    dot: 'bg-violet-500',
  },
  EN_PROCESO_CONTRATO: {
    badge:
      'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
    dot: 'bg-indigo-500',
  },
  CONTRATO_ACTIVO: {
    badge:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  DESCARTADO: {
    badge:
      'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
    dot: 'bg-rose-500',
  },
};

export const PIPELINE_STATUS_STYLES: Record<PipelineStatus, StatusStyle> = Object.fromEntries(
  PIPELINE_STATUSES.map((s) => [s, { label: PIPELINE_STATUS_LABELS[s], ...STYLES[s] }]),
) as Record<PipelineStatus, StatusStyle>;
