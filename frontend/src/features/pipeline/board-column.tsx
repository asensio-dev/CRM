import type { BoardColumnDto } from '@axiom/contracts';
import { useDroppable } from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Pagination } from '@/shared/ui/pagination';
import { BoardCard } from './board-card';
import { COLUMN_PAGE_SIZE, clampPage, columnPageCount, reachableCards } from './board-paging';

const nf = new Intl.NumberFormat('es-NI');

export interface DragInfo {
  /** Estado de origen de la tarjeta que se arrastra (null si no hay arrastre). */
  from: string | null;
  /** Destinos válidos según el backend; null mientras se consultan. */
  allowed: ReadonlySet<string> | null;
}

export interface BoardColumnProps {
  column: BoardColumnDto;
  drag: DragInfo;
  /** Página pedida (1-based); se recorta al rango de la columna. */
  page: number;
  onPageChange: (page: number) => void;
  /** El tablero está pidiendo más tarjetas (sube `limitPerColumn`). */
  loadingMore?: boolean;
}

export function BoardColumn({
  column,
  drag,
  page: requestedPage,
  onPageChange,
  loadingMore,
}: BoardColumnProps) {
  const { status } = column;
  const style = PIPELINE_STATUS_STYLES[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dragging = drag.from !== null;
  const isOrigin = drag.from === status;
  const allowedTarget = dragging && !isOrigin && !!drag.allowed?.has(status);
  const blocked = dragging && !isOrigin && !!drag.allowed && !drag.allowed.has(status);

  const pages = columnPageCount(column.count);
  const page = clampPage(requestedPage, column.count);
  const start = (page - 1) * COLUMN_PAGE_SIZE;
  const pageCards = column.cards.slice(start, start + COLUMN_PAGE_SIZE);
  // La página aún no está completa porque se están pidiendo más tarjetas al API.
  const expected = Math.min(COLUMN_PAGE_SIZE, reachableCards(column.count) - start);
  const waiting = pageCards.length < expected && !!loadingMore;
  const capped = column.count > reachableCards(column.count);

  return (
    <section
      ref={setNodeRef}
      aria-label={`${style.label}, ${column.count} empresas`}
      data-status={status}
      data-drop-allowed={allowedTarget ? 'true' : undefined}
      className={cn(
        'flex min-w-0 snap-start flex-col rounded-xl bg-muted/60 ring-1 ring-transparent transition-[opacity,box-shadow,background-color] duration-150 dark:bg-muted/40',
        blocked && 'opacity-40',
        allowedTarget && 'ring-2 ring-primary/40',
        allowedTarget && isOver && 'bg-accent ring-primary',
      )}
    >
      <header className="flex items-start gap-2 px-3 pb-2 pt-3">
        <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', style.dot)} />
        <h2 className="text-sm font-semibold leading-snug">{style.label}</h2>
        <span className="ml-auto rounded-md bg-card px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground shadow-xs">
          {nf.format(column.count)}
        </span>
      </header>
      <ul className="flex min-h-24 flex-col gap-2 px-2 pb-2">
        {pageCards.map((card) => (
          <BoardCard key={card.id} card={card} />
        ))}
        {waiting && (
          <li className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Cargando empresas…
          </li>
        )}
        {column.cards.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Sin empresas
          </li>
        )}
      </ul>
      {pages > 1 && (
        <div className="mt-auto space-y-1.5 px-2 pb-2">
          <Pagination
            variant="compact"
            page={page}
            pageSize={COLUMN_PAGE_SIZE}
            total={reachableCards(column.count)}
            onPageChange={onPageChange}
            itemLabel="empresas"
            className="px-1"
          />
          {capped && page === pages && (
            <p className="px-1 text-center text-xs text-muted-foreground">
              Se muestran las primeras {nf.format(reachableCards(column.count))}. Usa la búsqueda
              para encontrar el resto.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
