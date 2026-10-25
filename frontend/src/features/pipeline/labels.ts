import {
  INTERACTION_CHANNEL_LABELS,
  INTERACTION_OUTCOME_LABELS,
  type InteractionOutcome,
} from '@axiom/contracts';

// Etiquetas compartidas con el backend (nota automática del historial): viven en @axiom/contracts.
export const CHANNEL_LABELS = INTERACTION_CHANNEL_LABELS;
export const OUTCOME_LABELS = INTERACTION_OUTCOME_LABELS;

/** Tono visual del resultado (clases de badge, con modo oscuro). */
export const OUTCOME_TONES: Record<InteractionOutcome, string> = {
  CONTESTO: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  NO_CONTESTO: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  NUMERO_EQUIVOCADO: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  INTERESADO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  NO_INTERESADO: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  VOLVER_A_LLAMAR: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
};
