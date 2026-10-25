/**
 * Fechas calendario en hora de Nicaragua (America/Managua, UTC-6 fijo: no hay horario de verano).
 * Los días viajan como `YYYY-MM-DD`; la aritmética se hace en UTC sobre el mediodía para evitar saltos.
 */
const TIME_ZONE = 'America/Managua';
const OFFSET = '-06:00';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día (YYYY-MM-DD) que corresponde a un instante, visto desde Managua. */
export function managuaDay(instant: Date | string = new Date()): string {
  return dayFormat.format(typeof instant === 'string' ? new Date(instant) : instant);
}

function parseDay(day: string): Date {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

/** Lunes de la semana ISO que contiene `day`. */
export function mondayOf(day: string): string {
  const dow = parseDay(day).getUTCDay(); // 0 = domingo
  return addDays(day, -((dow + 6) % 7));
}

/** Instante ISO (UTC) del inicio del día `day` en Managua. */
export function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00${OFFSET}`).toISOString();
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Rango `[from, to)` en ISO UTC de la semana que empieza en `monday` (para la agenda). */
export function weekRangeIso(monday: string): { from: string; to: string } {
  return { from: dayStartIso(monday), to: dayStartIso(addDays(monday, 7)) };
}

const weekdayShort = new Intl.DateTimeFormat('es-NI', { weekday: 'short', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('es-NI', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const dayMonthYear = new Intl.DateTimeFormat('es-NI', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const longDay = new Intl.DateTimeFormat('es-NI', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('es-NI', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});

export const formatWeekday = (day: string) => weekdayShort.format(parseDay(day));
export const formatDayMonth = (day: string) => dayMonth.format(parseDay(day));
export const formatDayMonthYear = (day: string) => dayMonthYear.format(parseDay(day));
export const formatLongDay = (day: string) => longDay.format(parseDay(day));
/** "3:05 p. m." en Managua. */
export const formatTime = (iso: string | Date) =>
  timeFormat.format(typeof iso === 'string' ? new Date(iso) : iso);

/** "19 oct – 25 oct 2026" / "28 dic 2026 – 3 ene 2027". */
export function formatWeekRange(monday: string): string {
  const end = addDays(monday, 6);
  const sameYear = monday.slice(0, 4) === end.slice(0, 4);
  return sameYear
    ? `${formatDayMonth(monday)} – ${formatDayMonthYear(end)}`
    : `${formatDayMonthYear(monday)} – ${formatDayMonthYear(end)}`;
}

/** Valor de `<input type="datetime-local">` interpretado como hora de Managua → ISO UTC. */
export function managuaLocalToIso(value: string): string {
  const v = value.length === 16 ? `${value}:00` : value;
  return new Date(`${v}${OFFSET}`).toISOString();
}

/** Instante → valor `datetime-local` en hora de Managua ("2026-10-25T14:30"). */
export function isoToManaguaLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 16);
}
