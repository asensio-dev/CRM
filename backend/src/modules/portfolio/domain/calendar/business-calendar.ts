/**
 * Aritmética de calendario del negocio (pura, sin dependencias).
 *
 * - `LocalDate` es una fecha civil `YYYY-MM-DD` en la zona del negocio (America/Managua por defecto).
 *   Se persiste en columnas `DATE` como medianoche UTC de esa fecha (convención de Prisma para @db.Date).
 * - Las semanas empiezan el lunes (ISO 8601).
 * - Los instantes (Date) se convierten a fecha local con `Intl`, así que la zona es configurable
 *   y los cambios de horario (si la zona los tuviera) se respetan.
 */
export type LocalDate = string;

const DAY_MS = 86_400_000;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Medianoche UTC de la fecha (forma de persistir en columnas DATE). */
export function toUtcMidnight(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Inversa de `toUtcMidnight` (lee una columna DATE). */
export function fromUtcMidnight(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

export function isLocalDate(value: string): value is LocalDate {
  if (!LOCAL_DATE.test(value)) return false;
  const parsed = toUtcMidnight(value);
  return !Number.isNaN(parsed.getTime()) && fromUtcMidnight(parsed) === value;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMidnight(new Date(toUtcMidnight(date).getTime() + days * DAY_MS));
}

/** `a - b` en días. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMidnight(a).getTime() - toUtcMidnight(b).getTime()) / DAY_MS);
}

/** 1 = lunes … 7 = domingo. */
export function isoWeekday(date: LocalDate): number {
  const day = toUtcMidnight(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(date: LocalDate): LocalDate {
  return addDays(date, 1 - isoWeekday(date));
}

export const maxDate = (a: LocalDate, b: LocalDate): LocalDate => (a >= b ? a : b);

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(instant: Date, timeZone: string) {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}` as LocalDate,
    utcEquivalent: Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ),
  };
}

/** Comprueba que la zona IANA existe (p. ej. al leer el parámetro TIMEZONE). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Fecha civil del instante en la zona. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  return wallClock(instant, timeZone).date;
}

/** Desfase de la zona en ese instante (local − UTC) en ms; Managua = −6 h. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const whole = Math.floor(instant.getTime() / 1000) * 1000;
  return wallClock(new Date(whole), timeZone).utcEquivalent - whole;
}

/** Instante en que empieza (00:00 local) la fecha en la zona. */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const guess = toUtcMidnight(date).getTime();
  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Segunda pasada: si el desfase cambia entre la suposición y el resultado (DST), se corrige.
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Intervalo semiabierto de instantes [start, end). */
export interface InstantRange {
  start: Date;
  end: Date;
}

/** Calendario ligado a una zona: convierte entre instantes y fechas/semanas locales. */
export class BusinessCalendar {
  constructor(readonly timeZone: string) {}

  today(now: Date): LocalDate {
    return localDateOf(now, this.timeZone);
  }

  currentMonday(now: Date): LocalDate {
    return mondayOf(this.today(now));
  }

  /** Instantes que cubren los días locales [from, toInclusive]. */
  range(from: LocalDate, toInclusive: LocalDate): InstantRange {
    return {
      start: startOfLocalDay(from, this.timeZone),
      end: startOfLocalDay(addDays(toInclusive, 1), this.timeZone),
    };
  }

  /** Lunes 00:00 → lunes siguiente 00:00 (local). */
  week(monday: LocalDate): InstantRange {
    return this.range(monday, addDays(monday, 6));
  }
}
