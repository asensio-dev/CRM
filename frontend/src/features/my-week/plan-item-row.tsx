import type { MyWeekItemDto, PipelineStateDto } from '@axiom/contracts';
import { Link } from '@tanstack/react-router';
import { CalendarClock, CheckCircle2, Circle, ClipboardCheck, Phone, PhoneOff } from 'lucide-react';
import { ChangeStatusMenu } from '@/features/pipeline';
import { cn } from '@/shared/lib/cn';
import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { StatusBadge } from '@/shared/ui/status-badge';
import { REASON_META } from './plan-utils';

export function companyDisplayName(item: MyWeekItemDto): string {
  return item.tradeName && item.tradeName !== item.legalName ? item.tradeName : item.legalName;
}

interface PlanItemRowProps {
  item: MyWeekItemDto;
  onRegister: (item: MyWeekItemDto) => void;
  onStatusChanged: (item: MyWeekItemDto, state: PipelineStateDto) => void;
  /** Para marcar vencidos los seguimientos (inyectable en tests). */
  now?: number;
}

/** Fila del plan semanal: pensada para móvil (objetivos táctiles de 44 px). */
export function PlanItemRow({
  item,
  onRegister,
  onStatusChanged,
  now = Date.now(),
}: PlanItemRowProps) {
  const reason = REASON_META[item.reason];
  const contacted = item.contactedAt !== null;
  const followUpDue = item.nextFollowUpAt !== null && new Date(item.nextFollowUpAt).getTime() < now;

  return (
    <li
      data-testid={`plan-item-${item.itemId}`}
      data-contacted={contacted}
      data-reason={item.reason}
      className={cn('min-w-0 px-4 py-4 transition-colors sm:px-5', contacted && 'bg-success/5')}
    >
      <div className="flex items-start gap-3">
        {contacted ? (
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Circle className="mt-0.5 size-6 shrink-0 text-muted-foreground/50" aria-hidden="true" />
        )}
        <span className="sr-only">{contacted ? 'Contactada' : 'Pendiente'}</span>
        <div className="min-w-0 flex-1">
          <Link
            to="/empresas/$companyId"
            params={{ companyId: item.companyId }}
            className="block rounded text-base font-semibold leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.legalName}
          </Link>
          {item.tradeName && item.tradeName !== item.legalName && (
            <p className="truncate text-sm text-muted-foreground">{item.tradeName}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={reason.badge} title={reason.hint}>
              {reason.label}
            </Badge>
            <StatusBadge status={item.status} />
          </div>
          <dl className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <dt>Último contacto:</dt>
              <dd>
                {item.lastContactAt ? (
                  <time dateTime={item.lastContactAt} title={formatAbsolute(item.lastContactAt)}>
                    {formatRelative(item.lastContactAt)}
                  </time>
                ) : (
                  'sin contacto'
                )}
              </dd>
            </div>
            {item.nextFollowUpAt && (
              <div
                className={cn(
                  'flex items-center gap-1',
                  followUpDue && !contacted && 'font-medium text-destructive',
                )}
              >
                <CalendarClock className="size-3.5" aria-hidden="true" />
                <dt className="sr-only">Próximo seguimiento</dt>
                <dd>
                  Seguimiento{' '}
                  <time dateTime={item.nextFollowUpAt} title={formatAbsolute(item.nextFollowUpAt)}>
                    {formatRelative(item.nextFollowUpAt)}
                  </time>
                </dd>
              </div>
            )}
            {contacted && item.contactedAt && (
              <div className="flex gap-1 text-success">
                <dt>Contactada:</dt>
                <dd>
                  <time dateTime={item.contactedAt} title={formatAbsolute(item.contactedAt)}>
                    {formatRelative(item.contactedAt)}
                  </time>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        {item.phone ? (
          <Button asChild variant="outline" className="col-span-2 h-11 sm:col-span-1">
            <a href={`tel:${item.phone}`} aria-label={`Llamar a ${item.legalName}: ${item.phone}`}>
              <Phone aria-hidden="true" />
              {item.phone}
            </a>
          </Button>
        ) : (
          <span className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground sm:col-span-1">
            <PhoneOff className="size-4" aria-hidden="true" /> Sin teléfono
          </span>
        )}
        <Button
          variant={contacted ? 'outline' : 'default'}
          className="h-11"
          aria-label={`Registrar contacto con ${item.legalName}`}
          onClick={() => onRegister(item)}
        >
          <ClipboardCheck aria-hidden="true" />
          Registrar contacto
        </Button>
        <ChangeStatusMenu
          companyId={item.companyId}
          companyName={item.legalName}
          size="default"
          className="h-11 w-full sm:w-auto"
          onChanged={(state) => onStatusChanged(item, state)}
        />
      </div>
    </li>
  );
}
