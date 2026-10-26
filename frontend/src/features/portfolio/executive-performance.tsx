import type { ExecutiveCoverageDto } from '@axiom/contracts';
import { Link } from '@tanstack/react-router';
import { ArrowRight, SearchX } from 'lucide-react';
import { useClientList } from '@/shared/hooks/use-client-list';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Pagination } from '@/shared/ui/pagination';
import { SearchInput } from '@/shared/ui/search-input';
import { percent } from './format';
import { ProgressBar } from './progress-bar';

export const EXECUTIVES_PAGE_SIZE = 8;
const EXECUTIVE_PAGE_SIZES = [8, 16, 32] as const;
/** A partir de cuántos ejecutivos se ofrece el buscador. */
const SEARCH_THRESHOLD = 6;

const executiveText = (e: ExecutiveCoverageDto) => e.fullName;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''}`.toUpperCase();
}

function MeterBlock({
  title,
  figure,
  children,
}: {
  title: string;
  figure: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground">{title}</span>
        <span className="font-medium tabular-nums">{figure}</span>
      </div>
      {children}
    </div>
  );
}

function ExecutiveRow({ e }: { e: ExecutiveCoverageDto }) {
  const planPct = e.plan ? percent(e.plan.contacted, e.plan.quota) : 0;
  return (
    <li
      data-testid={`exec-${e.userId}`}
      className="grid gap-4 px-5 py-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-8"
    >
      <div className="flex min-w-0 items-center gap-3 md:col-span-2 lg:col-span-1">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
        >
          {initials(e.fullName)}
        </span>
        <div className="min-w-0">
          <CardTitle className="truncate">{e.fullName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cartera: <span className="tabular-nums">{e.assigned}</span> /{' '}
            <span className="tabular-nums">{e.target}</span> empresas
          </p>
        </div>
      </div>
      <MeterBlock
        title="Cobertura del ciclo"
        figure={`${e.contactedThisCycle}/${e.assigned} · ${Math.round(e.coveragePct)}%`}
      >
        <ProgressBar
          value={e.contactedThisCycle}
          max={e.assigned}
          label={`Cobertura del ciclo de ${e.fullName}`}
          complete={e.assigned > 0 && e.contactedThisCycle >= e.assigned}
        />
      </MeterBlock>
      <MeterBlock
        title="Plan de esta semana"
        figure={e.plan ? `${e.plan.contacted}/${e.plan.quota} · ${planPct}%` : 'Sin plan'}
      >
        {e.plan ? (
          <ProgressBar
            value={e.plan.contacted}
            max={e.plan.quota}
            label={`Plan semanal de ${e.fullName}`}
            complete={e.plan.contacted >= e.plan.quota}
          />
        ) : (
          <div className="h-2 rounded-full border border-dashed" aria-hidden="true" />
        )}
      </MeterBlock>
      <Link
        to="/mi-semana"
        search={{ userId: e.userId } as never}
        aria-label={`Ver la semana de ${e.fullName}`}
        className="inline-flex items-center gap-1 justify-self-start rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:justify-self-end"
      >
        Ver su semana <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Cobertura del ciclo y plan semanal por ejecutivo, con búsqueda y paginación en cliente. */
export function ExecutivePerformance({
  executives,
  self,
}: {
  executives: readonly ExecutiveCoverageDto[];
  /** El usuario es un ejecutivo que solo ve su propia fila. */
  self: boolean;
}) {
  const list = useClientList(executives, {
    searchText: executiveText,
    pageSize: EXECUTIVES_PAGE_SIZE,
  });
  const searchable = executives.length > SEARCH_THRESHOLD;
  const paginated = executives.length > EXECUTIVES_PAGE_SIZE;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="grid gap-0.5">
          <h2 id="exec-performance-title" className="text-base font-semibold">
            {self ? 'Tu avance' : 'Rendimiento por ejecutivo'}
          </h2>
          <CardDescription>
            Cobertura de la cartera en el ciclo y avance del plan semanal.
          </CardDescription>
        </div>
        {searchable && (
          <SearchInput
            className="sm:w-64"
            value={list.query}
            onValueChange={list.setQuery}
            placeholder="Buscar ejecutivo…"
          />
        )}
      </div>
      {list.total === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={SearchX}
            title="Ningún ejecutivo coincide"
            description="Prueba con otro nombre."
          />
        </div>
      ) : (
        <ul className="divide-y" aria-label="Ejecutivos del ciclo">
          {list.pageItems.map((e) => (
            <ExecutiveRow key={e.userId} e={e} />
          ))}
        </ul>
      )}
      {paginated && list.total > 0 && (
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          pageSizeOptions={EXECUTIVE_PAGE_SIZES}
          itemLabel="ejecutivos"
        />
      )}
    </Card>
  );
}
