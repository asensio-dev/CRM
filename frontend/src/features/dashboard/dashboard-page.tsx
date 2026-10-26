import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useSessionStore } from '@/features/auth/session-store';
import { useSectors } from '@/features/companies';
import { useRememberedTab } from '@/shared/hooks/use-remembered-tab';
import { cn } from '@/shared/lib/cn';
import { managuaDay } from '@/shared/lib/managua-time';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryError } from '@/shared/ui/query-error';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Skeleton } from '@/shared/ui/skeleton';
import { type TabItem, TabPanel, Tabs, useTabsId } from '@/shared/ui/tabs';
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
        <SearchableSelect
          id="f-sector"
          value={sectors.data?.find((s) => s.id === search.sectorId) ?? null}
          onChange={(o) => update({ sectorId: o?.id })}
          options={sectors.data ?? []}
          isLoading={sectors.isPending}
          placeholder="Todos"
          searchPlaceholder="Buscar sector…"
          emptyText="Ningún sector coincide"
        />
      </div>
    </form>
  );
}

/** Esqueleto con la forma de una tarjeta de gráfico: título, subtítulo y barras sobre su pista. */
function CardSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn('rounded-xl border bg-card p-5 shadow-sm', className)}
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <div className="mt-6 flex h-56 items-end gap-3">
        {SKELETON_BARS.map((h, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
          <div key={i} className="relative h-full flex-1 overflow-hidden rounded-md bg-track">
            <Skeleton
              className="absolute inset-x-0 bottom-0 rounded-md"
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const SKELETON_BARS = [22, 35, 30, 48, 42, 60, 55, 70, 64, 78, 72, 50] as const;

/** Esqueleto de lista (ejecutivos, cobertura, embudo): filas con nombre y barra. */
function ListSkeleton({ label, rows = 7 }: { label: string; rows?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="rounded-xl border bg-card p-5 shadow-sm"
    >
      <Skeleton className="h-4 w-44" />
      <Skeleton className="mt-2 h-3 w-60 max-w-full" />
      <div className="mt-6 space-y-5">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
          <div key={i} className="space-y-2">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

const DASHBOARD_TABS = ['resumen', 'actividad', 'pipeline', 'ejecutivos'] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

export function DashboardPage() {
  const { search, update } = useDashboardSearch();
  const role = useSessionStore((s) => s.user?.role);
  const canPickExecutive = role === 'SUPERVISOR' || role === 'ADMIN';
  const [byExecutive, setByExecutive] = useState(false);
  const [tab, setTab] = useRememberedTab<DashboardTab>('tablero', DASHBOARD_TABS, 'resumen');
  const tabsId = useTabsId();

  const today = managuaDay();
  const filter = useMemo(() => toFilterValues(search, today), [search, today]);

  // Todas las consultas arrancan a la vez: cambiar de pestaña no vuelve a esperar al API.
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

  const tabs: TabItem<DashboardTab>[] = [
    { value: 'resumen', label: 'Resumen' },
    { value: 'actividad', label: 'Actividad' },
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'ejecutivos', label: 'Ejecutivos' },
  ];

  return (
    <div>
      <PageHeader
        title="Tablero"
        description="Indicadores de cartera, cuota semanal y avance del pipeline."
      />
      <Filters search={search} update={update} canPickExecutive={canPickExecutive} />

      <Tabs
        idBase={tabsId}
        label="Secciones del tablero"
        items={tabs}
        value={tab}
        onValueChange={setTab}
        className="mb-6"
      />

      {tab === 'resumen' && (
        <TabPanel idBase={tabsId} value="resumen">
          {summary.isPending ? (
            <KpiSkeleton />
          ) : summary.isError ? (
            <QueryError error={summary.error} onRetry={() => summary.refetch()} />
          ) : (
            <KpiTiles summary={summary.data} weeks={weekly.data?.weeks} />
          )}
        </TabPanel>
      )}

      {tab === 'actividad' && (
        <TabPanel
          idBase={tabsId}
          value="actividad"
          className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0"
        >
          {weekly.isPending ? (
            <>
              <CardSkeleton label="Cargando actividad semanal" />
              <CardSkeleton label="Cargando resultados" />
            </>
          ) : weekly.isError ? (
            <QueryError
              error={weekly.error}
              onRetry={() => weekly.refetch()}
              title="No se pudo cargar la actividad"
            />
          ) : (
            <>
              <WeeklyActivityCard
                data={weekly.data}
                byExecutive={byExecutive && canPickExecutive}
                action={byExecutiveToggle}
              />
              <OutcomesCard data={weekly.data} />
            </>
          )}
        </TabPanel>
      )}

      {tab === 'pipeline' && (
        <TabPanel idBase={tabsId} value="pipeline">
          {funnel.isPending ? (
            <ListSkeleton label="Cargando embudo" rows={8} />
          ) : funnel.isError ? (
            <QueryError
              error={funnel.error}
              onRetry={() => funnel.refetch()}
              title="No se pudo cargar el embudo"
            />
          ) : (
            <FunnelCard funnel={funnel.data} />
          )}
        </TabPanel>
      )}

      {tab === 'ejecutivos' && (
        <TabPanel
          idBase={tabsId}
          value="ejecutivos"
          className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0"
        >
          <div className="xl:col-span-2">
            {executives.isPending ? (
              <ListSkeleton label="Cargando ejecutivos" />
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
          {coverage.isPending ? (
            <ListSkeleton label="Cargando cobertura" rows={5} />
          ) : coverage.isError ? (
            <QueryError
              error={coverage.error}
              onRetry={() => coverage.refetch()}
              title="No se pudo cargar la cobertura"
            />
          ) : (
            <CoverageCard data={coverage.data} />
          )}
        </TabPanel>
      )}
    </div>
  );
}
