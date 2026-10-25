import type { AppointmentDto } from '@axiom/contracts';
import { cn } from '@/shared/lib/cn';
import {
  formatDayMonth,
  formatLongDay,
  formatWeekday,
  managuaDay,
  weekDays,
} from '@/shared/lib/managua-time';
import { AppointmentCard } from './appointment-card';

/** Agrupa por día de Managua (una cita a las 21:00 locales cae en el día correcto aunque en UTC sea el siguiente). */
export function groupByDay(appointments: readonly AppointmentDto[]): Map<string, AppointmentDto[]> {
  const map = new Map<string, AppointmentDto[]>();
  for (const a of appointments) {
    const day = managuaDay(a.scheduledAt);
    const list = map.get(day);
    if (list) list.push(a);
    else map.set(day, [a]);
  }
  for (const list of map.values()) {
    list.sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt));
  }
  return map;
}

/**
 * Agenda semanal: siete columnas (lunes a domingo) desde `lg`; en móvil se convierte en una lista
 * de días apilados.
 */
export function AgendaWeek({
  monday,
  appointments,
  today,
}: {
  monday: string;
  appointments: readonly AppointmentDto[];
  today: string;
}) {
  const byDay = groupByDay(appointments);
  return (
    <ul className="grid gap-3 lg:grid-cols-7" aria-label="Agenda de la semana">
      {weekDays(monday).map((day) => {
        const items = byDay.get(day) ?? [];
        const isToday = day === today;
        return (
          <li
            key={day}
            data-day={day}
            aria-label={formatLongDay(day)}
            className={cn(
              'min-w-0 rounded-lg border bg-muted/30 p-2',
              isToday && 'border-primary/60 bg-accent/40',
              items.length === 0 && 'max-lg:py-1.5',
            )}
          >
            <h3 className="mb-2 flex items-baseline justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className={cn(isToday && 'text-primary')}>{formatWeekday(day)}</span>
              <span className="font-normal normal-case">
                {formatDayMonth(day)}
                {isToday && ' · hoy'}
              </span>
            </h3>
            {items.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground max-lg:pb-1">Sin citas</p>
            ) : (
              <div className="space-y-2">
                {items.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} compact />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
