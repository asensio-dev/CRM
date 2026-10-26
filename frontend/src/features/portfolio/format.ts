import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/** `YYYY-MM-DD` (fecha local de negocio) → Date a medianoche local, sin desfases de zona. */
export function parseLocalDate(value: string): Date {
  const [y = 1970, m = 1, d = 1] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "26 oct – 1 nov" para un rango de fechas locales. */
export function formatLocalRange(start: string, end: string): string {
  return `${format(parseLocalDate(start), 'd MMM', { locale: es })} – ${format(parseLocalDate(end), 'd MMM', { locale: es })}`;
}

/** Porcentaje entero 0..100 (0 si no hay total). */
export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

const DAY_MS = 86_400_000;

export interface CycleDay {
  /** 0..(totalWeeks·7 − 1). */
  index: number;
  date: Date;
  /** Semana del ciclo (1..totalWeeks). */
  week: number;
  state: 'past' | 'today' | 'future';
}

/** Días del ciclo (semanas de lunes a domingo) con su estado respecto a `today`. */
export function cycleDays(startDate: string, totalWeeks: number, today = new Date()): CycleDay[] {
  const start = parseLocalDate(startDate);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Math.round absorbe el cambio de hora (días de 23 o 25 h).
  const todayIndex = Math.round((todayMid.getTime() - start.getTime()) / DAY_MS);
  return Array.from({ length: Math.max(0, totalWeeks) * 7 }, (_, index) => ({
    index,
    date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
    week: Math.floor(index / 7) + 1,
    state: index < todayIndex ? 'past' : index === todayIndex ? 'today' : 'future',
  }));
}

/** "19–25 oct" (o "26 oct – 1 nov" si cambia de mes) para un rango de fechas. */
export function formatDayRange(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${format(end, 'd MMM', { locale: es })}`;
  }
  return `${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM', { locale: es })}`;
}
