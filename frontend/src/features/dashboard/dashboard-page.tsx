import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useSessionStore } from '@/features/auth/session-store';
import { useSectors } from '@/features/companies';
import { cn } from '@/shared/lib/cn';
import { managuaDay } from '@/shared/lib/managua-time';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryError } from '@/shared/ui/query-error';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Skeleton } from '@/shared/ui/skeleton';
import { OutcomesCard, WeeklyActivityCard } from './activity-cards';
import './chart-theme.css';
import { CoverageCard, ExecutivesCard } from './executives-card';
import { FunnelCard } from './funnel-card';
import { KpiSkeleton, KpiTiles } from './kpi-tiles';
import {
  useCycleCoverage,
  useExecutives,
  useFunnel,
  useSummary,
  useWeeklyActivity,
} from './queries';
import {
  type DashboardSearch,
  dashboardSearchSchema,
  PERIOD_LABELS,
  PERIODS,
  toFilterValues,
} from './search';

function useDashboardSearch() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const search = useMemo(() => dashboardSearchSchema.parse(raw ?? {}), [raw]);
  const update = (patch: Partial<DashboardSearch>) =>
    navigate({
      to: '/tablero',
      search: ((prev: Record<string, unknown>) => {
        const next = { ...dashboardSearchSchema.parse(prev), ...patch };
        const custom = next.period === 'custom';
        return {
          period: next.period === '4w' ? undefined : next.period,
          from: custom ? next.from : undefined,
          to: custom ? next.to : undefined,
          userId: next.userId || undefined,
          sectorId: next.sectorId || undefined,
        };
      }) as never,
      replace: true,
    });
  return { search, update };
}

/** Selector de período como control segmentado (radiogroup). */
function PeriodControl({
  value,
  onChange,
}: {
  value: DashboardSearch['period'];
  onChange: (p: DashboardSearch['period']) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span id="f-period-label" className="text-sm font-medium">
        Período
      </span>
      <div
        role="radiogroup"
        aria-labelledby="f-period-label"
        className="inline-flex h-9 flex-wrap items-center rounded-lg border bg-card p-0.5 shadow-xs"
      >
        {PERIODS.map((p) => (
          // biome-ignore lint/a11y/useSemanticElements: control segmentado; botones con rol radio.
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => onChange(p)}
            className={cn(
              'h-full rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value === p
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Filters({
  search,
  update,
  canPickExecutive,
}: {
  search: DashboardSearch;
  update: (patch: Partial<DashboardSearch>) => void;
  canPickExecutive: boolean;
}) {
  const sectors = useSectors();
  // Lista completa de ejecutivos (sin filtros) para poder cambiar de uno a otro.
  const executives = useExecutives({}, canPickExecutive);
  const options = useMemo(
    () => (executives.data?.executives ?? []).map((x) => ({ id: x.userId, name: x.fullName })),
    [executives.data],
  );
  const selected = search.userId
    ? (options.find((o) => o.id === search.userId) ?? {
        id: search.userId,
        name: `Ejecutivo ${search.userId}`,
      })
    : null;
  return (
    <form
      className="mb-6 flex flex-wrap items-end gap-3"
      aria-label="Filtros del tablero"
      onSubmit={(e) => e.preventDefault()}
    >
      <PeriodControl value={search.period} onChange={(period) => update({ period })} />
      {search.period === 'custom' && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="f-from">Desde</Label>
            <Input
              id="f-from"
              type="date"
              value={search.from ?? ''}
              max={search.to}
              onChange={(e) => update({ from: e.target.value || undefined })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-to">Hasta</Label>
            <Input
              id="f-to"
              type="date"
              value={search.to ?? ''}
              min={search.from}
              onChange={(e) => update({ to: e.target.value || undefined })}
            />
          </div>
        </>
      )}
      {canPickExecutive && (
        <div className="grid min-w-56 gap-1.5">
          <Label htmlFor="f-exec">Ejecutivo</Label>
          <SearchableSelect
            id="f-exec"
            value={selected}
            onChange={(o) => update({ userId: o?.id })}
            options={options}
            isLoading={executives.isPending}
            placeholder="Todos"
            searchPlaceholder="Buscar ejecutivo…"
            emptyText="Ningún ejecutivo coincide"
          />
        </div>
      )}
      <div className="grid min-w-44 gap-1.5">
        <Label htmlFor="f-sector">Sector</Label>
        <NativeSelect
          id="f-sector"
          value={search.sectorId ?? ''}
          onChange={(e) =>
            update({ sectorId: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">Todos</option>
          {sectors.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </form>
  );
}

function CardSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

export function DashboardPage() {
  const { search, update } = useDashboardSearch();
  const role = useSessionStore((s) => s.user?.role);
  const canPickExecutive = role === 'SUPERVISOR' || role === 'ADMIN';
  const [byExecutive, setByExecutive] = useState(false);

  const today = managuaDay();
  const filter = useMemo(() => toFilterValues(search, today), [search, today]);

  const summary = useSummary(filter);
  const funnel = useFunnel(filter);
  const weekly = useWeeklyActivity(filter, byExecutive && canPickExecutive);
  const executives = useExecutives(filter);
  const coverage = useCycleCoverage(filter);

  const byExecutiveToggle = canPickExecutive ? (
    <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={byExecutive}
        onChange={(e) => setByExecutive(e.target.checked)}
        className="size-4 accent-[var(--primary)]"
      />
      Ver actividad por ejecutivo
    </label>
  ) : undefined;

  return (
    <div>
      <PageHeader
        title="Tablero"
        description="Indicadores de cartera, cuota semanal y avance del pipeline."
      />
      <Filters search={search} update={update} canPickExecutive={canPickExecutive} />

      <div className="space-y-6">
        {summary.isPending ? (
          <KpiSkeleton />
        ) : summary.isError ? (
          <QueryError error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          <KpiTiles summary={summary.data} weeks={weekly.data?.weeks} />
        )}

        <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
          <div className="xl:col-span-2">
            {weekly.isPending ? (
              <CardSkeleton label="Cargando actividad semanal" />
            ) : weekly.isError ? (
              <QueryError
                error={weekly.error}
                onRetry={() => weekly.refetch()}
                title="No se pudo cargar la actividad"
              />
            ) : (
              <WeeklyActivityCard
                data={weekly.data}
                byExecutive={byExecutive && canPickExecutive}
                action={byExecutiveToggle}
              />
            )}
          </div>
          {coverage.isPending ? (
            <CardSkeleton label="Cargando cobertura" />
          ) : coverage.isError ? (
            <QueryError
              error={coverage.error}
              onRetry={() => coverage.refetch()}
              title="No se pudo cargar la cobertura"
            />
          ) : (
            <CoverageCard data={coverage.data} />
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
          {funnel.isPending ? (
            <CardSkeleton label="Cargando embudo" />
          ) : funnel.isError ? (
            <QueryError
              error={funnel.error}
              onRetry={() => funnel.refetch()}
              title="No se pudo cargar el embudo"
            />
          ) : (
            <FunnelCard funnel={funnel.data} />
          )}
          {weekly.isPending ? (
            <CardSkeleton label="Cargando resultados" />
          ) : weekly.isError ? null : (
            <OutcomesCard data={weekly.data} />
          )}
        </div>

        {executives.isPending ? (
          <CardSkeleton label="Cargando ejecutivos" />
        ) : executives.isError ? (
          <QueryError
            error={executives.error}
            onRetry={() => executives.refetch()}
            title="No se pudo cargar los ejecutivos"
          />
        ) : (
          <ExecutivesCard data={executives.data} />
        )}
      </div>
    </div>
  );
}
