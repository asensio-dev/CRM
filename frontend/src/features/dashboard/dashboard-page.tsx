import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useSessionStore } from '@/features/auth/session-store';
import { useSectors } from '@/features/companies';
import { managuaDay } from '@/shared/lib/managua-time';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryError } from '@/shared/ui/query-error';
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
  const options = useExecutives({}, canPickExecutive);
  return (
    <form
      className="mb-6 flex flex-wrap items-end gap-3"
      aria-label="Filtros del tablero"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="f-period">Período</Label>
        <NativeSelect
          id="f-period"
          value={search.period}
          onChange={(e) => update({ period: e.target.value as DashboardSearch['period'] })}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
      </div>
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
        <div className="grid gap-1.5">
          <Label htmlFor="f-exec">Ejecutivo</Label>
          <NativeSelect
            id="f-exec"
            value={search.userId ?? ''}
            onChange={(e) =>
              update({ userId: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">Todos</option>
            {options.data?.executives.map((x) => (
              <option key={x.userId} value={x.userId}>
                {x.fullName}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="grid gap-1.5">
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

function CardSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <Skeleton className="h-72" />
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

        {canPickExecutive && (
          <label className="flex w-fit items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={byExecutive}
              onChange={(e) => setByExecutive(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Ver actividad por ejecutivo
          </label>
        )}
        {weekly.isPending ? (
          <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
            <CardSkeleton label="Cargando actividad semanal" />
            <CardSkeleton label="Cargando resultados" />
          </div>
        ) : weekly.isError ? (
          <QueryError
            error={weekly.error}
            onRetry={() => weekly.refetch()}
            title="No se pudo cargar la actividad"
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
            <WeeklyActivityCard data={weekly.data} byExecutive={byExecutive && canPickExecutive} />
            <OutcomesCard data={weekly.data} />
          </div>
        )}

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
