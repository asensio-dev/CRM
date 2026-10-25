import {
  type MyWeekItemDto,
  normalizeSearchText,
  PLAN_ITEM_REASONS,
  type PlanItemReason,
} from '@axiom/contracts';
import { z } from 'zod';

export type PlanTab = 'pending' | 'contacted' | 'all';

export const PLAN_TABS: readonly { id: PlanTab; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'contacted', label: 'Contactadas' },
  { id: 'all', label: 'Todas' },
];

export const REASON_META: Record<PlanItemReason, { label: string; hint: string; badge: string }> = {
  SEGUIMIENTO: {
    label: 'Seguimiento',
    hint: 'Tiene un seguimiento o cita comprometida esta semana',
    badge:
      'border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300',
  },
  NUEVA: {
    label: 'Nueva',
    hint: 'Empresa que todavía no se ha contactado',
    badge:
      'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300',
  },
  REINTENTO: {
    label: 'Reintento',
    hint: 'No respondió en el intento anterior',
    badge:
      'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300',
  },
  ROTACION: {
    label: 'Rotación',
    hint: 'Toca retomar el contacto para cubrir la cartera del ciclo',
    badge:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-300',
  },
};

export interface Progress {
  contacted: number;
  quota: number;
  /** 0..100, redondeado y acotado. */
  pct: number;
  /** Contactos que faltan para llegar a la cuota (nunca negativo). */
  remaining: number;
  /** Cuota alcanzada (o superada). */
  reached: boolean;
}

export function progressOf(contacted: number, quota: number): Progress {
  const pct = quota > 0 ? Math.min(100, Math.round((contacted / quota) * 100)) : 0;
  return {
    contacted,
    quota,
    pct,
    remaining: Math.max(0, quota - contacted),
    reached: quota > 0 && contacted >= quota,
  };
}

/** Del más prioritario (1) al menos; el backend ya los manda así, esto lo garantiza. */
export function sortByPriority(items: readonly MyWeekItemDto[]): MyWeekItemDto[] {
  return [...items].sort((a, b) => a.priority - b.priority);
}

export function tabCounts(items: readonly MyWeekItemDto[]): Record<PlanTab, number> {
  const contacted = items.filter((i) => i.contactedAt !== null).length;
  return { pending: items.length - contacted, contacted, all: items.length };
}

/** Cantidad de ítems por motivo (todas las claves presentes, aunque sea 0). */
export function reasonCounts(items: readonly MyWeekItemDto[]): Record<PlanItemReason, number> {
  const out = Object.fromEntries(PLAN_ITEM_REASONS.map((r) => [r, 0])) as Record<
    PlanItemReason,
    number
  >;
  for (const i of items) out[i.reason] += 1;
  return out;
}

/** Filtra por pestaña y por texto (razón social, nombre comercial o teléfono; sin acentos). */
export function filterItems(
  items: readonly MyWeekItemDto[],
  tab: PlanTab,
  query: string,
): MyWeekItemDto[] {
  const q = normalizeSearchText(query);
  const digits = query.replace(/\D/g, '');
  return items.filter((i) => {
    if (tab === 'pending' && i.contactedAt !== null) return false;
    if (tab === 'contacted' && i.contactedAt === null) return false;
    if (!q) return true;
    const name = normalizeSearchText(`${i.legalName} ${i.tradeName ?? ''}`);
    if (name.includes(q)) return true;
    return digits.length >= 3 && (i.phone ?? '').replace(/\D/g, '').includes(digits);
  });
}

/** `?userId=` de la URL: entero positivo o `undefined` (valores inválidos se ignoran). */
export function parseUserIdParam(raw: unknown): number | undefined {
  const parsed = z.coerce.number().int().positive().safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
