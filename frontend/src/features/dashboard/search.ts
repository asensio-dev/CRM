import { z } from 'zod';
import { addDays, mondayOf } from '@/shared/lib/managua-time';

export const PERIODS = ['week', '4w', '12w', 'custom'] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  week: 'Esta semana',
  '4w': 'Últimas 4 semanas',
  '12w': 'Últimas 12 semanas',
  custom: 'Personalizado',
};

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const id = z.coerce.number().int().positive().optional().catch(undefined);

/** Filtros del tablero en la URL (`/tablero?period=4w&userId=&sectorId=&from=&to=`). */
export const dashboardSearchSchema = z.object({
  period: z.enum(PERIODS).default('4w').catch('4w'),
  from: day,
  to: day,
  userId: id,
  sectorId: id,
});
export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

export interface AnalyticsFilterValues {
  from?: string;
  to?: string;
  userId?: number;
  sectorId?: number;
}

/** Período → rango de días de Managua (`to` inclusivo). `today` es un día `YYYY-MM-DD`. */
export function periodRange(
  search: Pick<DashboardSearch, 'period' | 'from' | 'to'>,
  today: string,
): { from?: string; to?: string } {
  const monday = mondayOf(today);
  switch (search.period) {
    case 'week':
      return { from: monday, to: today };
    case '4w':
      return { from: addDays(monday, -21), to: today };
    case '12w':
      return { from: addDays(monday, -77), to: today };
    case 'custom': {
      const { from, to } = search;
      if (from && to && from > to) return { from: to, to: from };
      return { from, to };
    }
  }
}

export function toFilterValues(search: DashboardSearch, today: string): AnalyticsFilterValues {
  return {
    ...periodRange(search, today),
    userId: search.userId,
    sectorId: search.sectorId,
  };
}

export function filterQueryString(
  f: AnalyticsFilterValues,
  extra: Record<string, string> = {},
): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.userId) p.set('userId', String(f.userId));
  if (f.sectorId) p.set('sectorId', String(f.sectorId));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}
