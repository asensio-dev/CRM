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

export function AppointmentCard({
  appointment: a,
  compact = false,
  showDate = false,
}: {
  appointment: AppointmentDto;
  /** Tarjeta estrecha de la agenda semanal: acciones solo con icono. */
  compact?: boolean;
  /** En la lista, muestra fecha completa en vez de solo la hora. */
  showDate?: boolean;
}) {
  const [dialog, setDialog] = useState<'reschedule' | 'complete' | 'cancel' | null>(null);
  const ModeIcon = MODE_ICONS[a.mode];
  const actions = availableActions(a.status);
  const inactive = a.status === 'CANCELADA' || a.status === 'REPROGRAMADA';

  return (
    <article
      aria-label={`Cita con ${a.companyName ?? `empresa ${a.companyId}`}`}
      data-testid={`appointment-${a.id}`}
      className={cn(
        'space-y-2 rounded-md border bg-card p-3 text-sm shadow-sm',
        inactive && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <time dateTime={a.scheduledAt} className="font-semibold tabular-nums">
          {showDate ? formatAbsolute(a.scheduledAt) : formatTime(a.scheduledAt)}
        </time>
        <AppointmentStatusBadge status={a.status} />
      </div>
      <Link
        to="/empresas/$companyId"
        params={{ companyId: a.companyId }}
        className={cn('block font-medium hover:underline', inactive && 'line-through')}
      >
        {a.companyName ?? `Empresa ${a.companyId}`}
      </Link>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ModeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {MODE_LABELS[a.mode]}
          {a.location ? ` · ${a.location}` : ''}
        </span>
      </p>
      {a.notes && !compact && (
        <p className="whitespace-pre-line text-xs text-muted-foreground">{a.notes}</p>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size={compact ? 'icon' : 'sm'}
            className={compact ? 'size-7' : undefined}
            aria-label="Reprogramar"
            title="Reprogramar"
            onClick={() => setDialog('reschedule')}
          >
            <CalendarClock aria-hidden="true" />
            {!compact && 'Reprogramar'}
          </Button>
          <Button
            variant="outline"
            size={compact ? 'icon' : 'sm'}
            className={compact ? 'size-7' : undefined}
            aria-label="Completar"
            title="Completar"
            onClick={() => setDialog('complete')}
          >
            <CheckCircle2 aria-hidden="true" />
            {!compact && 'Completar'}
          </Button>
          <Button
            variant="outline"
            size={compact ? 'icon' : 'sm'}
            className={compact ? 'size-7' : undefined}
            aria-label="Cancelar"
            title="Cancelar"
            onClick={() => setDialog('cancel')}
          >
            <XCircle aria-hidden="true" />
            {!compact && 'Cancelar'}
          </Button>
        </div>
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
