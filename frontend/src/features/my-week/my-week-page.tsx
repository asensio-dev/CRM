import type { MyWeekDto, MyWeekItemDto } from '@axiom/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarOff, ClipboardList, PartyPopper, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessionStore } from '@/features/auth/session-store';
import { RegisterContactDialog } from '@/features/pipeline';
import { portfolioKeys, useCurrentCycle, useMyWeek } from '@/features/portfolio/api';
import { formatLocalRange } from '@/features/portfolio/format';
import { ProgressBar } from '@/features/portfolio/progress-bar';
import { RunWeeklyButton, RunWeeklyDialog } from '@/features/portfolio/run-weekly';
import { useClientList } from '@/shared/hooks/use-client-list';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { SearchInput } from '@/shared/ui/search-input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Skeleton } from '@/shared/ui/skeleton';
import { companyDisplayName, PlanItemRow } from './plan-item-row';
import {
  filterItems,
  PLAN_TABS,
  type PlanTab,
  parseUserIdParam,
  progressOf,
  REASON_META,
  reasonCounts,
  sortByPriority,
  tabCounts,
} from './plan-utils';

export const PLAN_PAGE_SIZE = DEFAULT_PAGE_SIZE;
const PLAN_PAGE_SIZES = DEFAULT_PAGE_SIZE_OPTIONS;

function WeekHeader({ data, ownerName }: { data: MyWeekDto; ownerName?: string }) {
  const week = data.week;
  const p = progressOf(data.contactedCount, data.quota);
  if (!week) return null;
  return (
    <Card className="grid gap-4 p-5 sm:p-6" data-testid="week-header" data-reached={p.reached}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium text-muted-foreground">
          {ownerName ? `${ownerName} · ` : ''}Semana {week.weekNumber} de {week.totalWeeks} · Ciclo
          #{week.cycle.number}
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatLocalRange(week.weekStart, week.weekEnd)}
        </p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <p
            className="text-5xl font-semibold leading-none tracking-[-0.03em] tabular-nums"
            aria-hidden="true"
          >
            {data.contactedCount}
            <span className="text-2xl font-medium text-muted-foreground"> / {data.quota}</span>
          </p>
          <p className="pb-1 text-sm text-muted-foreground">
            <span className="sr-only">
              {data.contactedCount} de {data.quota}{' '}
            </span>
            contactadas
          </p>
        </div>
        <p className="pb-1 text-sm text-muted-foreground">
          Plan de la semana: {data.totalItems} empresas.
        </p>
      </div>
      <ProgressBar
        size="lg"
        value={data.contactedCount}
        max={data.quota}
        complete={p.reached}
        label="Progreso de la cuota semanal"
      />
      {p.reached ? (
        <p className="flex items-center gap-2 text-sm font-medium text-success" role="status">
          <PartyPopper className="size-5" aria-hidden="true" />
          ¡Cuota semanal cumplida!
          {data.contactedCount > data.quota && ` (+${data.contactedCount - data.quota} extra)`}
        </p>
      ) : (
        <p className="text-sm" role="status">
          Te {p.remaining === 1 ? 'falta' : 'faltan'}{' '}
          <strong className="tabular-nums">{p.remaining}</strong>{' '}
          {p.remaining === 1 ? 'contacto' : 'contactos'} para la cuota ·{' '}
          <span className="tabular-nums">{p.pct}%</span>
        </p>
      )}
    </Card>
  );
}

function MyWeekSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando tu semana" className="grid gap-3">
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

export function MyWeekPage() {
  const user = useSessionStore((s) => s.user);
  const staff = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;

  // Solo ADMIN/SUPERVISOR pueden ver la semana de otro; el ejecutivo ignora `?userId=`.
  const cycle = useCurrentCycle(staff);
  const executives = cycle.data?.executives ?? [];
  const urlUserId = staff ? parseUserIdParam(rawSearch.userId) : undefined;
  const effectiveUserId = staff ? (urlUserId ?? executives[0]?.userId) : undefined;
  const staffReady = !staff || !cycle.isPending;
  const week = useMyWeek(effectiveUserId, staffReady);
  const data = week.data;
  const ownerName =
    effectiveUserId !== undefined && effectiveUserId !== user?.id
      ? executives.find((e) => e.userId === effectiveUserId)?.fullName
      : undefined;

  const [tab, setTabState] = useState<PlanTab>('pending');
  const [query, setQueryState] = useState('');
  const [registering, setRegistering] = useState<MyWeekItemDto | null>(null);
  const [runWeeklyOpen, setRunWeeklyOpen] = useState(false);

  const refresh = () => void qc.invalidateQueries({ queryKey: portfolioKeys.all });

  // Aviso de cuota cumplida: solo cuando se cruza el umbral estando en la pantalla.
  const reachedRef = useRef<{ key: string; reached: boolean } | null>(null);
  useEffect(() => {
    if (!data?.week) return;
    const reached = progressOf(data.contactedCount, data.quota).reached;
    const key = `${data.userId}:${data.week.weekStart}`;
    const prev = reachedRef.current;
    if (prev && prev.key === key && !prev.reached && reached) {
      toast.success('¡Cuota semanal cumplida! Buen trabajo.');
    }
    reachedRef.current = { key, reached };
  }, [data]);

  const items = useMemo(() => sortByPriority(data?.items ?? []), [data]);
  const counts = useMemo(() => tabCounts(items), [items]);
  const reasons = useMemo(() => reasonCounts(items), [items]);
  const visible = useMemo(() => filterItems(items, tab, query), [items, tab, query]);
  // El API devuelve el plan completo: la paginación se hace en cliente sobre lo filtrado.
  const list = useClientList(visible, { pageSize: PLAN_PAGE_SIZE });

  const setTab = (t: PlanTab) => {
    setTabState(t);
    list.setPage(1);
  };
  const setQuery = (q: string) => {
    setQueryState(q);
    list.setPage(1);
  };

  const onSelectExecutive = (id: number | undefined) =>
    void navigate({
      to: '/mi-semana',
      search: (id !== undefined ? { userId: id } : {}) as never,
      replace: true,
    });

  const executiveOptions = executives.map((e) => ({
    id: e.userId,
    name: `${e.fullName}${e.plan ? ` — ${e.plan.contacted}/${e.plan.quota}` : ' — sin plan'}`,
  }));
  const selectedExecutive =
    effectiveUserId === undefined
      ? null
      : (executiveOptions.find((o) => o.id === effectiveUserId) ?? {
          id: effectiveUserId,
          name: `Usuario ${effectiveUserId}`,
        });

  const selector =
    staff && executives.length > 0 ? (
      <div className="grid gap-1 sm:max-w-xs">
        <Label htmlFor="week-executive">Ejecutivo</Label>
        <SearchableSelect
          id="week-executive"
          aria-label="Ejecutivo"
          value={selectedExecutive}
          onChange={(o) => o && onSelectExecutive(o.id)}
          options={executiveOptions}
          clearable={false}
          searchPlaceholder="Buscar ejecutivo…"
          emptyText="Ningún ejecutivo coincide"
        />
      </div>
    ) : null;

  let body: React.ReactNode;
  if (week.isPending || (staff && cycle.isPending)) {
    body = <MyWeekSkeleton />;
  } else if (week.isError && !data) {
    body = <QueryError error={week.error} onRetry={() => void week.refetch()} />;
  } else if (!data?.week) {
    body = (
      <EmptyState
        icon={CalendarOff}
        title="Aún no hay un ciclo activo"
        description={
          isAdmin
            ? 'No se ha abierto ningún ciclo de rotación. Ejecuta la rotación semanal para abrirlo, repartir las carteras y generar los planes.'
            : 'Todavía no se ha abierto un ciclo de rotación. Un administrador debe ejecutar la rotación semanal; vuelve a revisar en un momento.'
        }
        action={
          isAdmin ? (
            <RunWeeklyButton variant="default" onClick={() => setRunWeeklyOpen(true)} />
          ) : undefined
        }
      />
    );
  } else if (data.planId === null) {
    body = (
      <>
        <WeekHeader data={data} ownerName={ownerName} />
        <EmptyState
          icon={ClipboardList}
          title={
            ownerName
              ? `${ownerName} no tiene plan esta semana`
              : 'Tu plan semanal aún no se generó'
          }
          description={
            isAdmin
              ? 'El plan se genera con la rotación semanal (lunes 6:00). Si el ciclo ya está abierto, puedes ejecutarla ahora: no duplica nada.'
              : 'El plan se genera automáticamente cada lunes. Si ya pasó, pide a un administrador que ejecute la rotación semanal.'
          }
          action={
            isAdmin ? (
              <RunWeeklyButton variant="default" onClick={() => setRunWeeklyOpen(true)} />
            ) : undefined
          }
        />
      </>
    );
  } else {
    body = (
      <>
        <WeekHeader data={data} ownerName={ownerName} />
        {data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="El plan de esta semana está vacío"
            description="No hay empresas en la cartera para planificar. Pide que te asignen empresas desde Cartera."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="grid gap-3 border-b px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Plan de contactos</h2>
                <ul
                  className="flex flex-wrap gap-1.5"
                  aria-label="Resumen del plan por motivo"
                  data-testid="reason-summary"
                >
                  {(Object.keys(reasons) as (keyof typeof reasons)[])
                    .filter((r) => reasons[r] > 0)
                    .map((r) => (
                      <li key={r}>
                        <Badge
                          variant="outline"
                          className={REASON_META[r].badge}
                          title={REASON_META[r].hint}
                        >
                          {REASON_META[r].label}: {reasons[r]}
                        </Badge>
                      </li>
                    ))}
                </ul>
              </div>
              <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
                <div
                  role="tablist"
                  aria-label="Filtrar plan"
                  className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:inline-grid"
                >
                  {PLAN_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        'h-9 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        tab === t.id
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t.label} <span className="tabular-nums">({counts[t.id]})</span>
                    </button>
                  ))}
                </div>
                <SearchInput
                  className="sm:w-72"
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Buscar en el plan…"
                  aria-label="Buscar en el plan"
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="p-5">
                {query ? (
                  <EmptyState
                    icon={SearchX}
                    title="Sin resultados"
                    description="Ninguna empresa del plan coincide con la búsqueda en esta pestaña."
                    action={
                      <Button variant="outline" onClick={() => setQuery('')}>
                        Limpiar búsqueda
                      </Button>
                    }
                  />
                ) : tab === 'pending' ? (
                  <EmptyState
                    icon={PartyPopper}
                    title="¡No quedan pendientes!"
                    description="Contactaste a todas las empresas de tu plan de la semana."
                    action={
                      <Button variant="outline" onClick={() => setTab('all')}>
                        Ver todas
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={ClipboardList}
                    title="Todavía no hay contactadas"
                    description="Las empresas aparecerán aquí cuando registres su contacto."
                  />
                )}
              </div>
            ) : (
              <>
                <ul className="divide-y" aria-label="Plan semanal">
                  {list.pageItems.map((item) => (
                    <PlanItemRow
                      key={item.itemId}
                      item={item}
                      onRegister={setRegistering}
                      onStatusChanged={refresh}
                    />
                  ))}
                </ul>
                <Pagination
                  page={list.page}
                  pageSize={list.pageSize}
                  total={list.total}
                  onPageChange={list.setPage}
                  onPageSizeChange={list.setPageSize}
                  pageSizeOptions={PLAN_PAGE_SIZES}
                  itemLabel="empresas"
                />
              </>
            )}
          </Card>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <PageHeader
        title="Mi semana"
        description="Tu plan de contactos de la semana y el avance de tu cuota."
      />
      {selector}
      {body}
      {registering && (
        <RegisterContactDialog
          companyId={registering.companyId}
          companyName={companyDisplayName(registering)}
          planItemId={registering.itemId}
          open
          onRegistered={refresh}
          onOpenChange={(o) => {
            if (!o) {
              setRegistering(null);
              // El marcado del ítem lo hace el backend al reaccionar al evento: se revalida al cerrar.
              refresh();
            }
          }}
        />
      )}
      {/* Fuera de `body`: el estado vacío que contiene el botón desaparece al refrescarse tras la rotación */}
      {isAdmin && <RunWeeklyDialog open={runWeeklyOpen} onOpenChange={setRunWeeklyOpen} />}
    </div>
  );
}
