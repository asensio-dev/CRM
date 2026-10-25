/**
 * Aritmética de fechas en America/Managua. Nicaragua no tiene horario de verano (UTC-6 fijo),
 * así que un día de Managua empieza a las 06:00 UTC. Las semanas son ISO (lunes a domingo).
 * En la BD las fechas se guardan en UTC (DateTime2).
 */
export const MANAGUA_OFFSET_MINUTES = -6 * 60;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` del día de Managua en el que cae el instante. */
export function managuaDay(instant: Date): string {
  return new Date(instant.getTime() + MANAGUA_OFFSET_MINUTES * MS_PER_MINUTE)
    .toISOString()
    .slice(0, 10);
}

/** Instante UTC en que empieza el día `YYYY-MM-DD` de Managua. */
export function startOfDayUtc(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - MANAGUA_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Días entre dos fechas `YYYY-MM-DD` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

/** Lunes (`YYYY-MM-DD`) de la semana ISO que contiene el día. */
export function isoWeekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(day, -((dow + 6) % 7));
}

export interface WeekWindow {
  /** Lunes `YYYY-MM-DD`. */
  startDay: string;
  /** Domingo `YYYY-MM-DD`. */
  endDay: string;
  /** [startUtc, endUtc) */
  startUtc: Date;
  endUtc: Date;
}

export function weekOf(instant: Date): WeekWindow {
  const startDay = isoWeekStart(managuaDay(instant));
  return {
    startDay,
    endDay: addDays(startDay, 6),
    startUtc: startOfDayUtc(startDay),
    endUtc: startOfDayUtc(addDays(startDay, 7)),
  };
}

export interface UtcRange {
  /** Inclusivo; null = sin cota. */
  from: Date | null;
  /** Exclusivo; null = sin cota. */
  to: Date | null;
}

/** `from`/`to` son días de Managua; `to` es inclusivo (se convierte a "hasta el día siguiente"). */
export function periodRange(from?: string, to?: string): UtcRange {
  return {
    from: from ? startOfDayUtc(from) : null,
    to: to ? startOfDayUtc(addDays(to, 1)) : null,
  };
}

export interface WeeksWindow {
  /** Lunes de la primera semana, `YYYY-MM-DD`. */
  anchorDay: string;
  /** Lunes de cada semana, de la más antigua a la más reciente. */
  weekStarts: string[];
  range: { from: Date; to: Date };
}

/**
 * Las `weeks` semanas ISO que terminan en la semana que contiene `to` (por defecto, hoy).
 * Si se indica `from`, se recorta el inicio al lunes de su semana.
 */
export function weeksWindow(now: Date, weeks: number, from?: string, to?: string): WeeksWindow {
  const lastMonday = isoWeekStart(to ?? managuaDay(now));
  let first = addDays(lastMonday, -7 * (weeks - 1));
  if (from) {
    const fromMonday = isoWeekStart(from);
    if (fromMonday > first) first = fromMonday;
  }
  const weekStarts: string[] = [];
  for (let d = first; d <= lastMonday; d = addDays(d, 7)) weekStarts.push(d);
  const lastEnd = addDays(lastMonday, 7);
  return {
    anchorDay: first,
    weekStarts,
    range: {
      from: from && isoWeekStart(from) === first ? startOfDayUtc(from) : startOfDayUtc(first),
      to: to ? startOfDayUtc(addDays(to, 1)) : startOfDayUtc(lastEnd),
    },
  };
}

/** Porcentaje con un decimal; null si el denominador es 0. */
export function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
