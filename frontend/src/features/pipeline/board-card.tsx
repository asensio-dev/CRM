import type { BoardCardDto } from '@axiom/contracts';
import { useDraggable } from '@dnd-kit/core';
import { Link } from '@tanstack/react-router';
import { Clock, MoreHorizontal, Phone, Users } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';
import { Button } from '@/shared/ui/button';
import { ChangeStatusMenu } from './change-status-menu';

const nf = new Intl.NumberFormat('es-NI');

export function CardBody({ card }: { card: BoardCardDto }) {
  const showTradeName = card.tradeName && card.tradeName !== card.legalName;
  return (
    <>
      <div className="min-w-0 pr-7">
        <Link
          to="/empresas/$companyId"
          params={{ companyId: card.id }}
          className="line-clamp-2 text-sm font-medium leading-snug text-foreground after:absolute after:inset-0 after:rounded-lg hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {card.legalName}
        </Link>
        {showTradeName && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.tradeName}</p>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {card.phone && (
          <a
            href={`tel:${card.phone}`}
            className="relative z-10 inline-flex items-center gap-1 rounded-sm tabular-nums hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Phone className="size-3" aria-hidden="true" />
            {card.phone}
          </a>
        )}
        <span className="inline-flex items-center gap-1 tabular-nums" title="Empleados">
          <Users className="size-3" aria-hidden="true" />
          {nf.format(card.employeeCount)}
        </span>
      </div>
      <p
        className="mt-2 flex items-center gap-1 border-t pt-2 text-xs text-muted-foreground"
        title={card.lastContactAt ? formatAbsolute(card.lastContactAt) : undefined}
      >
        <Clock className="size-3" aria-hidden="true" />
        {card.lastContactAt ? (
          <>
            Último contacto{' '}
            <span className="text-foreground">{formatRelative(card.lastContactAt)}</span>
          </>
        ) : (
          'Sin contacto'
        )}
      </p>
    </>
  );
}

const cardClass =
  'relative rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-[box-shadow,border-color] hover:border-input hover:shadow-sm';

/** Tarjeta arrastrable con menú "Mover a…" (alternativa accesible por teclado). */
export function BoardCard({ card }: { card: BoardCardDto }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  });
  // `attributes` añade role/tabindex del arrastre; el foco real va al enlace y al menú.
  const { role: _role, tabIndex: _tab, ...rest } = attributes;
  return (
    <li
      ref={setNodeRef}
      {...rest}
      {...listeners}
      data-testid={`card-${card.id}`}
      className={cn(
        cardClass,
        'touch-manipulation cursor-grab',
        isDragging && 'border-dashed opacity-40 shadow-none',
      )}
    >
      <CardBody card={card} />
      <ChangeStatusMenu
        companyId={card.id}
        companyName={card.legalName}
        label="Mover a…"
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1.5 top-1.5 z-10 size-7"
            aria-label={`Mover a… ${card.legalName}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        }
      />
    </li>
  );
}

/** Copia visual que sigue al puntero durante el arrastre. */
export function CardOverlay({ card }: { card: BoardCardDto }) {
  return (
    <div className={cn(cardClass, 'w-68 rotate-1 cursor-grabbing shadow-lg')}>
      <CardBody card={card} />
    </div>
  );
}
