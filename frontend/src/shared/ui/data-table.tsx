import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDelayedFlag } from '../hooks/use-delayed-flag';
import { cn } from '../lib/cn';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: readonly T[];
  getRowId: (row: T) => string;
  /** Orden controlado desde fuera (servidor). Las columnas con `enableSorting: true` lo disparan. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  onRowClick?: (row: T) => void;
  /** Etiqueta accesible de la fila al ser clicable (p. ej. "Abrir ficha de X"). */
  rowLabel?: (row: T) => string;
  /** Si se da, bajo `md` se muestran tarjetas en vez de tabla. */
  renderCard?: (row: T) => ReactNode;
  /** Atenúa el cuerpo mientras llegan datos nuevos (placeholderData). */
  isFetching?: boolean;
  caption?: string;
}

/** Tabla de datos con orden y paginación del lado del servidor (TanStack Table en modo manual). */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  sorting = [],
  onSortingChange,
  onRowClick,
  rowLabel,
  renderCard,
  isFetching,
  caption,
}: DataTableProps<T>) {
  // Solo atenúa si la recarga tarda: las respuestas rápidas no hacen parpadear la tabla.
  const dimmed = useDelayedFlag(!!isFetching);
  const table = useReactTable({
    columns,
    data: data as T[],
    getRowId,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div
      className={cn('transition-opacity duration-200', dimmed && 'opacity-60')}
      aria-busy={isFetching}
    >
      {renderCard && (
        <ul className="divide-y md:hidden">
          {data.map((row) => (
            <li key={getRowId(row)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  aria-label={rowLabel?.(row)}
                  className="block w-full p-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {renderCard(row)}
                </button>
              ) : (
                <div className="p-4">{renderCard(row)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={cn(renderCard && 'hidden md:block')}>
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
                      }
                      className={header.column.columnDef.meta?.className}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell, i) => (
                  <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                    {i === 0 && onRowClick ? (
                      <button
                        type="button"
                        aria-label={rowLabel?.(row.original)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(row.original);
                        }}
                        className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </button>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    /** Clases extra para `th` y `td` (anchos, alineación, visibilidad responsive). */
    className?: string;
  }
}
