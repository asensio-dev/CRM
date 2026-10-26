import { APPOINTMENT_STATUS_LABELS, type AppointmentDto } from '@axiom/contracts';
import { Link } from '@tanstack/react-router';
import { CalendarClock, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatAbsolute } from '@/shared/lib/format-date';
import { formatTime } from '@/shared/lib/managua-time';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  CancelAppointmentDialog,
  CompleteAppointmentDialog,
  RescheduleAppointmentDialog,
} from './action-dialogs';
import { APPOINTMENT_STATUS_BADGE, MODE_ICONS, MODE_LABELS } from './labels';

export function AppointmentStatusBadge({ status }: { status: AppointmentDto['status'] }) {
  return (
    <Badge variant="outline" className={APPOINTMENT_STATUS_BADGE[status]} data-status={status}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Acciones disponibles según el estado: solo una cita PROGRAMADA se puede gestionar. */
export function availableActions(
  status: AppointmentDto['status'],
): ('reschedule' | 'complete' | 'cancel')[] {
  return status === 'PROGRAMADA' ? ['reschedule', 'complete', 'cancel'] : [];
}

/** Texto en el que busca el filtro de citas (empresa, notas y lugar). */
export function appointmentSearchText(a: AppointmentDto): string {
  return [a.companyName ?? `Empresa ${a.companyId}`, a.notes ?? '', a.location ?? ''].join(' ');
}

const ACTIONS = [
  { key: 'reschedule', label: 'Reprogramar', Icon: CalendarClock },
  { key: 'complete', label: 'Completar', Icon: CheckCircle2 },
  { key: 'cancel', label: 'Cancelar', Icon: XCircle },
] as const;

export function AppointmentCard({
  appointment: a,
  compact = false,
  showDate = false,
}: {
  appointment: AppointmentDto;
  /** Tarjeta estrecha de la agenda semanal: acciones solo con icono. */
  compact?: boolean;
  /**
   * En la lista: fecha completa en vez de solo la hora y presentación en fila (sin borde propio,
   * porque la lista ya vive dentro de una tarjeta).
   */
  showDate?: boolean;
}) {
  const [dialog, setDialog] = useState<'reschedule' | 'complete' | 'cancel' | null>(null);
  const ModeIcon = MODE_ICONS[a.mode];
  const actions = availableActions(a.status);
  const inactive = a.status === 'CANCELADA' || a.status === 'REPROGRAMADA';
  const row = showDate && !compact;

  const time = (
    <time
      dateTime={a.scheduledAt}
      className={cn('font-semibold tabular-nums', row ? 'text-sm' : 'text-[13px]')}
    >
      {showDate ? formatAbsolute(a.scheduledAt) : formatTime(a.scheduledAt)}
    </time>
  );

  const body = (
    <div className="min-w-0 space-y-1">
      <Link
        to="/empresas/$companyId"
        params={{ companyId: a.companyId }}
        className={cn(
          'block font-medium leading-snug text-foreground hover:text-primary hover:underline',
          compact && 'line-clamp-2 break-words',
          inactive && 'line-through decoration-muted-foreground/60',
        )}
      >
        {a.companyName ?? `Empresa ${a.companyId}`}
      </Link>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ModeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className={cn(compact && 'line-clamp-2 break-words')}>
          {MODE_LABELS[a.mode]}
          {a.location ? ` · ${a.location}` : ''}
        </span>
      </p>
      {a.notes && !compact && (
        <p className="whitespace-pre-line text-xs text-muted-foreground">{a.notes}</p>
      )}
    </div>
  );

  const actionButtons = actions.length > 0 && (
    <div className={cn('flex flex-wrap gap-1.5', compact && 'gap-1')}>
      {ACTIONS.map(({ key, label, Icon }) => (
        <Button
          key={key}
          variant={compact ? 'ghost' : 'outline'}
          size={compact ? 'icon' : 'sm'}
          className={compact ? 'size-7 text-muted-foreground hover:text-foreground' : undefined}
          aria-label={label}
          title={label}
          onClick={() => setDialog(key)}
        >
          <Icon aria-hidden="true" />
          {!compact && label}
        </Button>
      ))}
    </div>
  );

  return (
    <article
      aria-label={`Cita con ${a.companyName ?? `empresa ${a.companyId}`}`}
      data-testid={`appointment-${a.id}`}
      className={cn(
        'text-sm',
        row
          ? 'grid gap-3 px-4 py-3.5 transition-colors hover:bg-accent/30 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-start'
          : 'space-y-2 rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm',
        inactive && 'opacity-70',
      )}
    >
      {row ? (
        <>
          <div className="flex items-center justify-between gap-2 md:block md:space-y-1.5">
            {time}
            <div>
              <AppointmentStatusBadge status={a.status} />
            </div>
          </div>
          {body}
          {actionButtons}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            {time}
            <AppointmentStatusBadge status={a.status} />
          </div>
          {body}
          {actionButtons}
        </>
      )}
      {dialog === 'reschedule' && (
        <RescheduleAppointmentDialog
          appointment={a}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}
      {dialog === 'complete' && (
        <CompleteAppointmentDialog
          appointment={a}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}
      {dialog === 'cancel' && (
        <CancelAppointmentDialog appointment={a} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
    </article>
  );
}
