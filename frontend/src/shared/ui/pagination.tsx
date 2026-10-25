import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

const nf = new Intl.NumberFormat('es-NI');

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ page, pageSize, total, onPageChange, disabled }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3 text-sm"
    >
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0
          ? 'Sin resultados'
          : `${nf.format(from)}–${nf.format(to)} de ${nf.format(total)}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          Página {nf.format(page)} de {nf.format(pages)}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Página anterior"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Página siguiente"
          disabled={disabled || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
