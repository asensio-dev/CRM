import {
  type InteractionChannel,
  PIPELINE_STATUS_LABELS,
  type TimelineEntryDto,
} from '@axiom/contracts';
import {
  ArrowRight,
  CalendarClock,
  Ellipsis,
  GitCommitHorizontal,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { type ComponentType, useEffect, useRef } from 'react';
import { CHANNEL_LABELS, OUTCOME_LABELS, OUTCOME_TONES } from '@/features/pipeline/labels';
import { cn } from '@/shared/lib/cn';
import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';
import { Button } from '@/shared/ui/button';
import { StatusBadge } from '@/shared/ui/status-badge';

const CHANNEL_ICONS: Record<InteractionChannel, ComponentType<{ className?: string }>> = {
  LLAMADA: Phone,
  WHATSAPP: MessageCircle,
  CORREO: Mail,
  VISITA: MapPin,
  OTRO: Ellipsis,
};

function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatAbsolute(iso)} className="text-xs text-muted-foreground">
      {formatRelative(iso)} · {formatAbsolute(iso)}
    </time>
  );
}

export function TimelineItem({ entry }: { entry: TimelineEntryDto }) {
  if (entry.type === 'INTERACTION') {
    const Icon = CHANNEL_ICONS[entry.channel];
    return (
      <li className="relative flex gap-3" data-entry-type="INTERACTION">
        <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground ring-4 ring-card">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{CHANNEL_LABELS[entry.channel]}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                OUTCOME_TONES[entry.outcome],
              )}
            >
              {OUTCOME_LABELS[entry.outcome]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{entry.user.fullName}</p>
          {entry.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{entry.notes}</p>}
          {entry.nextFollowUpAt && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3" aria-hidden="true" />
              Seguimiento: {formatAbsolute(entry.nextFollowUpAt)}
            </p>
          )}
          <div>
            <When iso={entry.occurredAt} />
          </div>
        </div>
      </li>
    );
  }
  return (
    <li className="relative flex gap-3" data-entry-type="STATUS_CHANGE">
      <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-card">
        <GitCommitHorizontal className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Cambio de estado</span>
          {entry.fromStatus && (
            <>
              <StatusBadge status={entry.fromStatus} />
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </>
          )}
          <StatusBadge status={entry.toStatus} />
        </div>
        <p className="text-xs text-muted-foreground">{entry.user.fullName}</p>
        {entry.note && <p className="mt-1 whitespace-pre-wrap text-sm">{entry.note}</p>}
        <div>
          <When iso={entry.occurredAt} />
        </div>
      </div>
    </li>
  );
}

/** Texto en el que se busca una entrada (canal, resultado, estados, notas, usuario). */
export function timelineEntryText(e: TimelineEntryDto): string {
  if (e.type === 'INTERACTION') {
    return [
      CHANNEL_LABELS[e.channel],
      OUTCOME_LABELS[e.outcome],
      e.notes ?? '',
      e.user.fullName,
    ].join(' ');
  }
  return [
    'Cambio de estado',
    e.fromStatus ? PIPELINE_STATUS_LABELS[e.fromStatus] : '',
    PIPELINE_STATUS_LABELS[e.toStatus],
    e.note ?? '',
    e.user.fullName,
  ].join(' ');
}

export interface TimelineProps {
  entries: TimelineEntryDto[];
  /** Carga incremental opcional; la ficha usa paginación numerada y no lo pasa. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/** Línea de tiempo. Con `onLoadMore`: botón "Cargar más" + scroll infinito si hay IntersectionObserver. */
export function Timeline({
  entries,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: TimelineProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinel.current;
    if (
      !el ||
      !hasMore ||
      loadingMore ||
      !loadRef.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const io = new IntersectionObserver((hits) => {
      if (hits.some((h) => h.isIntersecting)) loadRef.current?.();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore]);

  return (
    <div>
      <ol className="relative before:absolute before:bottom-5 before:left-4 before:top-2 before:w-px before:bg-border">
        {entries.map((e) => (
          <TimelineItem key={`${e.type}-${e.id}`} entry={e} />
        ))}
      </ol>
      {hasMore && onLoadMore && (
        <div ref={sentinel} className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}
    </div>
  );
}
