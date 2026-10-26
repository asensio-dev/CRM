import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { DEFAULT_PAGE_SIZE } from './pagination';
import { Skeleton } from './skeleton';

/*
 * Esqueletos de pantalla compartidos. Cada uno replica las medidas exactas del contenido real
 * (alto de línea del título, filas de 7, columnas del tablero) para que el paso
 * esqueleto → contenido no mueva nada: solo se "revela".
 */

/** Rejilla del tablero del pipeline: columnas fluidas, ~80% del ancho en móvil con imán. */
export const BOARD_GRID = 'grid items-stretch gap-3 [--col-min:80vw] sm:[--col-min:11rem]';
export const boardColumns = (n: number) => `repeat(${n}, minmax(var(--col-min), 1fr))`;

function Busy({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** Misma caja que `PageHeader`: título 1.65rem × 1.25 y descripción 0.875rem × 1.43. */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div aria-hidden="true" className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex h-[2.0625rem] items-center">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-80 max-w-[70vw]" />
        </div>
      </div>
      {action && <Skeleton className="h-9 w-40 rounded-lg" />}
    </div>
  );
}

/** Fila de filtros: buscador y selects con la altura real de los controles (36px). */
export function ToolbarSkeleton({
  selects = 2,
  className,
}: {
  selects?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn('flex flex-wrap items-center gap-2.5', className)}>
      <Skeleton className="h-9 w-full rounded-lg sm:w-80" />
      {Array.from({ length: selects }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
        <Skeleton key={i} className="h-9 w-full rounded-lg sm:w-52" />
      ))}
    </div>
  );
}

/** Pestañas subrayadas (misma altura que `Tabs`). */
export function TabsSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex h-10 items-center gap-6 shadow-[inset_0_-1px_0_var(--border)]',
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
        <Skeleton key={i} className="mb-1.5 h-4 w-24" />
      ))}
    </div>
  );
}

/** Columnas del pipeline con sus tarjetas mínimas (nombre en dos líneas + último contacto). */
export function BoardSkeleton({ columns = 6, cards = 5 }: { columns?: number; cards?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando tablero"
      className={cn(BOARD_GRID, 'overflow-hidden pb-4')}
      style={{ gridTemplateColumns: boardColumns(columns) }}
    >
      {Array.from({ length: columns }, (_, c) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
        <div key={c} className="space-y-2 rounded-xl bg-muted/60 px-2 pb-2 pt-3">
          <div className="flex items-center gap-2 px-1 pb-1">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-5 w-8 rounded-md" />
          </div>
          {Array.from({ length: cards }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
            <div key={i} className="space-y-2 rounded-lg border bg-card px-3 py-2.5">
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Tabla dentro de su tarjeta: barra de filtros, cabecera, 7 filas y pie de paginación. */
export function TableCardSkeleton({
  columns = 5,
  rows = DEFAULT_PAGE_SIZE,
  toolbar = true,
}: {
  columns?: number;
  rows?: number;
  toolbar?: boolean;
}) {
  return (
    <Busy label="Cargando listado" className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {toolbar && <ToolbarSkeleton className="border-b px-4 py-3" />}
      <div className="flex h-10 items-center gap-6 border-b bg-muted/45 px-4">
        {Array.from({ length: columns }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
        <div key={r} className="flex h-[3.25rem] items-center gap-6 border-b px-4 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
            <Skeleton key={c} className={cn('h-3.5 flex-1', c === 0 && 'flex-[2]')} />
          ))}
        </div>
      ))}
      <div className="flex h-[3.75rem] items-center justify-between border-t px-4">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>
    </Busy>
  );
}

/** Fila de indicadores (tarjetas de KPI). */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
        <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-3 h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

/** Bloque genérico en tarjeta, para fichas y paneles. */
export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('rounded-xl border bg-card p-5 shadow-sm', className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <div className="mt-5 space-y-3">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </div>
  );
}
