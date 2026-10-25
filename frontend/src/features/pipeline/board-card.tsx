import type { BoardCardDto } from '@axiom/contracts';
import { useDraggable } from '@dnd-kit/core';
import { Link } from '@tanstack/react-router';
import { Clock, MoreVertical, Phone, Users } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';
import { Button } from '@/shared/ui/button';
import { ChangeStatusMenu } from './change-status-menu';

export function CardBody({ card }: { card: BoardCardDto }) {
  return (
    <>
      <div className="min-w-0 pr-8">
        <Link
          to="/empresas/$companyId"
          params={{ companyId: card.id }}
          className="line-clamp-2 text-sm font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:rounded-md"
        >
          {card.legalName}
        </Link>
        {card.tradeName && card.tradeName !== card.legalName && (
          <p className="truncate text-xs text-muted-foreground">{card.tradeName}</p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {card.phone && (
          <a
            href={`tel:${card.phone}`}
            className="relative z-10 inline-flex items-center gap-1 hover:text-foreground hover:underline"
          >
            <Phone className="size-3" aria-hidden="true" />
            {card.phone}
          </a>
        )}
        <span className="inline-flex items-center gap-1" title="Empleados">
          <Users className="size-3" aria-hidden="true" />
          {card.employeeCount}
        </span>
        <span
          className="inline-flex items-center gap-1"
          title={card.lastContactAt ? formatAbsolute(card.lastContactAt) : undefined}
        >
          <Clock className="size-3" aria-hidden="true" />
          {card.lastContactAt ? formatRelative(card.lastContactAt) : 'Sin contacto'}
        </span>
      </div>
    </>
  );
}

const cardClass =
  'relative rounded-md border bg-card p-3 text-card-foreground shadow-sm transition-shadow hover:shadow-md';

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
      className={cn(cardClass, 'touch-manipulation cursor-grab', isDragging && 'opacity-40')}
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
            className="absolute right-1 top-1 z-10 size-7"
            aria-label={`Mover a… ${card.legalName}`}
          >
            <MoreVertical aria-hidden="true" />
          </Button>
        }
      />
    </li>
  );
}

/** Copia visual que sigue al puntero durante el arrastre. */
export function CardOverlay({ card }: { card: BoardCardDto }) {
  return (
    <div className={cn(cardClass, 'w-72 rotate-1 cursor-grabbing shadow-xl')}>
      <CardBody card={card} />
    </div>
  );
}
