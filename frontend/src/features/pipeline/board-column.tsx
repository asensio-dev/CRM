import type { BoardColumnDto } from '@axiom/contracts';
import { useDroppable } from '@dnd-kit/core';
import { ChevronsLeftRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Button } from '@/shared/ui/button';
import { BoardCard } from './board-card';

export interface DragInfo {
  /** Estado de origen de la tarjeta que se arrastra (null si no hay arrastre). */
  from: string | null;
  /** Destinos válidos según el backend; null mientras se consultan. */
  allowed: ReadonlySet<string> | null;
}

export interface BoardColumnProps {
  column: BoardColumnDto;
  drag: DragInfo;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Hay más empresas en la columna que tarjetas cargadas y se puede subir el límite. */
  canLoadMore: boolean;
  onLoadMore: () => void;
}

export function BoardColumn({
  column,
  drag,
  collapsible,
  collapsed,
  onToggleCollapsed,
  canLoadMore,
  onLoadMore,
}: BoardColumnProps) {
  const { status } = column;
  const style = PIPELINE_STATUS_STYLES[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dragging = drag.from !== null;
  const isOrigin = drag.from === status;
  const allowedTarget = dragging && !isOrigin && !!drag.allowed?.has(status);
  const blocked = dragging && !isOrigin && !!drag.allowed && !drag.allowed.has(status);

  return (
    <section
      ref={setNodeRef}
      aria-label={`${style.label}, ${column.count} empresas`}
      data-status={status}
      data-drop-allowed={allowedTarget ? 'true' : undefined}
      className={cn(
        'flex shrink-0 flex-col rounded-lg border bg-muted/40 transition-[opacity,box-shadow,width] duration-150',
        collapsed ? 'w-14' : 'w-72',
        blocked && 'opacity-40',
        allowedTarget && 'ring-2 ring-primary/50',
        allowedTarget && isOver && 'bg-accent ring-primary',
      )}
    >
      <header
        className={cn(
          'flex items-center gap-2 p-3',
          collapsed && 'flex-col [writing-mode:vertical-rl]',
        )}
      >
        <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', style.dot)} />
        <h2 className="truncate text-sm font-semibold">{style.label}</h2>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {column.count.toLocaleString('es-NI')}
        </span>
        {collapsible && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-7', !collapsed && 'ml-auto')}
            aria-label={collapsed ? `Expandir ${style.label}` : `Contraer ${style.label}`}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            <ChevronsLeftRight aria-hidden="true" />
          </Button>
        )}
      </header>
      {!collapsed && (
        <>
          <ul className="flex max-h-[calc(100dvh-20rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
            {column.cards.map((card) => (
              <BoardCard key={card.id} card={card} />
            ))}
            {column.cards.length === 0 && (
              <li className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Sin empresas
              </li>
            )}
          </ul>
          {canLoadMore && (
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={onLoadMore}>
                Ver más ({column.count - column.cards.length})
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
