import type { AppointmentDto } from '@axiom/contracts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  formatDayMonth,
  formatLongDay,
  formatWeekday,
  managuaDay,
  weekDays,
} from '@/shared/lib/managua-time';
import { AppointmentCard } from './appointment-card';

/** Citas visibles por día antes de "Ver más": la columna no crece sin límite en semanas cargadas. */
export const AGENDA_DAY_LIMIT = 4;

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

function AgendaDay({
  day,
  items,
  isToday,
  limit,
}: {
  day: string;
  items: AppointmentDto[];
  isToday: boolean;
  limit: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = Math.max(0, items.length - limit);
  const visible = expanded ? items : items.slice(0, limit);
  const listId = `agenda-day-${day}`;

  return (
    <li
      data-day={day}
      aria-label={formatLongDay(day)}
      className={cn(
        'min-w-0 rounded-xl bg-muted/55 p-2 ring-1 ring-transparent',
        isToday && 'bg-accent/70 ring-primary/30',
        items.length === 0 && 'max-lg:py-1.5',
      )}
    >
      <h3 className="mb-2 flex items-baseline justify-between gap-2 px-1.5 pt-0.5 text-[13px]">
        <span className={cn('font-semibold capitalize', isToday && 'text-primary')}>
          {formatWeekday(day)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDayMonth(day)}
          {isToday && ' · hoy'}
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="px-1.5 pb-1 text-xs text-muted-foreground">Sin citas</p>
      ) : (
        <>
          <div id={listId} className="space-y-2">
            {visible.map((a) => (
              <AppointmentCard key={a.id} appointment={a} compact />
            ))}
          </div>
          {hidden > 0 && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-primary hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  Ver {hidden} más
                </>
              )}
            </button>
          )}
        </>
      )}
    </li>
  );
}

/**
 * Agenda semanal: siete columnas (lunes a domingo) desde `lg`; en móvil se convierte en una lista
 * de días apilados. Cada día muestra hasta `limit` citas y un botón para ver el resto.
 */
export function AgendaWeek({
  monday,
  appointments,
  today,
  limit = AGENDA_DAY_LIMIT,
}: {
  monday: string;
  appointments: readonly AppointmentDto[];
  today: string;
  limit?: number;
}) {
  const byDay = groupByDay(appointments);
  return (
    <ul className="grid gap-2.5 lg:grid-cols-7" aria-label="Agenda de la semana">
      {weekDays(monday).map((day) => (
        <AgendaDay
          key={day}
          day={day}
          items={byDay.get(day) ?? []}
          isToday={day === today}
          limit={limit}
        />
      ))}
    </ul>
  );
}
