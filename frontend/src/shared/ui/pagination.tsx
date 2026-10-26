import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';

const nf = new Intl.NumberFormat('es-NI');

/** Tamaño de página por defecto de toda la app: listas cortas, sin scroll infinito. */
export const DEFAULT_PAGE_SIZE = 7;
export const DEFAULT_PAGE_SIZE_OPTIONS = [7, 14, 28, 56] as const;

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Si se da, muestra el selector de filas por página. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  disabled?: boolean;
  /**
   * `full` (por defecto): resumen, números de página y filas por página.
   * `compact`: solo anterior / «2 de 5» / siguiente, para columnas y popovers estrechos.
   */
  variant?: 'full' | 'compact';
  /** Nombre de lo que se pagina, para el resumen accesible (p. ej. "empresas"). */
  itemLabel?: string;
  className?: string;
}

type PageSlot = number | 'gap-start' | 'gap-end';

/** Números de página a mostrar: primera, última y vecinas de la actual, con huecos entre medias. */
export function pageWindow(page: number, pages: number): PageSlot[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) for (const p of [2, 3, 4]) set.add(p);
  if (page >= pages - 2) for (const p of [pages - 3, pages - 2, pages - 1]) set.add(p);
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: PageSlot[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === 'number' && p - prev > 1)
      out.push(out.includes('gap-start') ? 'gap-end' : 'gap-start');
    out.push(p);
  }
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  disabled,
  variant = 'full',
  itemLabel,
  className,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const summary =
    total === 0
      ? 'Sin resultados'
      : `${nf.format(from)}–${nf.format(to)} de ${nf.format(total)}${itemLabel ? ` ${itemLabel}` : ''}`;

  const prev = (
    <Button
      variant="outline"
      size="icon"
      aria-label="Página anterior"
      className={cn(variant === 'compact' && 'size-7')}
      disabled={disabled || page <= 1}
      onClick={() => onPageChange(page - 1)}
    >
      <ChevronLeft />
    </Button>
  );
  const next = (
    <Button
      variant="outline"
      size="icon"
      aria-label="Página siguiente"
      className={cn(variant === 'compact' && 'size-7')}
      disabled={disabled || page >= pages}
      onClick={() => onPageChange(page + 1)}
    >
      <ChevronRight />
    </Button>
  );

  if (variant === 'compact') {
    return (
      <nav
        aria-label="Paginación"
        className={cn('flex items-center justify-between gap-2 text-xs', className)}
      >
        <span className="sr-only" aria-live="polite">
          {summary}
        </span>
        {prev}
        <span className="tabular-nums text-muted-foreground">
          {nf.format(page)} / {nf.format(pages)}
        </span>
        {next}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Paginación"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-4 py-3 text-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
        <p aria-live="polite" className="tabular-nums">
          {summary}
        </p>
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            Filas por página
            <select
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground tabular-nums focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {prev}
        <ol className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, pages).map((p) =>
            typeof p === 'string' ? (
              <li key={p} aria-hidden="true" className="w-6 text-center text-muted-foreground">
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Página ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                  onClick={() => onPageChange(p)}
                  className={cn(
                    'h-9 min-w-9 rounded-lg px-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    p === page
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {nf.format(p)}
                </button>
              </li>
            ),
          )}
        </ol>
        <span className="px-1 text-muted-foreground tabular-nums sm:hidden">
          Página {nf.format(page)} de {nf.format(pages)}
        </span>
        {next}
      </div>
    </nav>
  );
}
