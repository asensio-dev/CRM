import type { InteractionChannel, InteractionOutcome } from '@axiom/contracts';

export const CHANNEL_LABELS: Record<InteractionChannel, string> = {
  LLAMADA: 'Llamada',
  WHATSAPP: 'WhatsApp',
  CORREO: 'Correo',
  VISITA: 'Visita',
  OTRO: 'Otro',
};

export const OUTCOME_LABELS: Record<InteractionOutcome, string> = {
  CONTESTO: 'Contestó',
  NO_CONTESTO: 'No contestó',
  NUMERO_EQUIVOCADO: 'Número equivocado',
  INTERESADO: 'Interesado',
  NO_INTERESADO: 'No interesado',
  VOLVER_A_LLAMAR: 'Volver a llamar',
};

/** Tono visual del resultado (clases de badge, con modo oscuro). */
export const OUTCOME_TONES: Record<InteractionOutcome, string> = {
  CONTESTO: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  NO_CONTESTO: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  NUMERO_EQUIVOCADO: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  INTERESADO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  NO_INTERESADO: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  VOLVER_A_LLAMAR: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
};
