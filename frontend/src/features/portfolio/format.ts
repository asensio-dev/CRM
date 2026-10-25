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
