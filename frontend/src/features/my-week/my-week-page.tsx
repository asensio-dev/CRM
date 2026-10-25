import type { MyWeekDto, MyWeekItemDto } from '@axiom/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarOff, ClipboardList, PartyPopper, Search, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessionStore } from '@/features/auth/session-store';
import { RegisterContactDialog } from '@/features/pipeline';
import { portfolioKeys, useCurrentCycle, useMyWeek } from '@/features/portfolio/api';
import { formatLocalRange } from '@/features/portfolio/format';
import { ProgressBar } from '@/features/portfolio/progress-bar';
import { RunWeeklyButton, RunWeeklyDialog } from '@/features/portfolio/run-weekly';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryError } from '@/shared/ui/query-error';
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

function WeekHeader({ data, ownerName }: { data: MyWeekDto; ownerName?: string }) {
  const week = data.week;
  const p = progressOf(data.contactedCount, data.quota);
  if (!week) return null;
  return (
    <Card
      className={cn(
        'mb-4 overflow-hidden',
        p.reached && 'border-emerald-300 dark:border-emerald-500/50',
      )}
      data-testid="week-header"
      data-reached={p.reached}
    >
      <CardContent className="grid gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium text-muted-foreground">
            {ownerName ? `${ownerName} · ` : ''}Semana {week.weekNumber} de {week.totalWeeks} ·
            Ciclo #{week.cycle.number}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatLocalRange(week.weekStart, week.weekEnd)}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <p className="text-5xl font-bold tabular-nums leading-none" aria-hidden="true">
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
        <ProgressBar
          size="lg"
          value={data.contactedCount}
          max={data.quota}
          complete={p.reached}
          label="Progreso de la cuota semanal"
        />
        {p.reached ? (
          <p
            className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            role="status"
          >
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
        <p className="text-xs text-muted-foreground">
          Plan de la semana: {data.totalItems} empresas.
        </p>
      </CardContent>
    </Card>
  );
}

function MyWeekSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando tu semana" className="grid gap-3">
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-36 w-full" />
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

  const [tab, setTab] = useState<PlanTab>('pending');
  const [query, setQuery] = useState('');
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

  const onSelectExecutive = (id: string) =>
    void navigate({
      to: '/mi-semana',
      search: (id ? { userId: Number(id) } : {}) as never,
      replace: true,
    });

  const selector =
    staff && executives.length > 0 ? (
      <div className="mb-4 grid gap-1 sm:max-w-xs">
        <Label htmlFor="week-executive">Ejecutivo</Label>
        <NativeSelect
          id="week-executive"
          className="h-11"
          value={effectiveUserId !== undefined ? String(effectiveUserId) : ''}
          onChange={(e) => onSelectExecutive(e.target.value)}
        >
          {effectiveUserId !== undefined &&
            !executives.some((e) => e.userId === effectiveUserId) && (
              <option value={effectiveUserId}>Usuario {effectiveUserId}</option>
            )}
          {executives.map((e) => (
            <option key={e.userId} value={e.userId}>
              {e.fullName}
              {e.plan ? ` — ${e.plan.contacted}/${e.plan.quota}` : ' — sin plan'}
            </option>
          ))}
        </NativeSelect>
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
          <>
            <ul
              className="mb-3 flex flex-wrap gap-1.5"
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

            <div className="mb-3 grid gap-2 sm:flex sm:items-center sm:justify-between">
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
                      'h-10 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      tab === t.id
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.label} <span className="tabular-nums">({counts[t.id]})</span>
                  </button>
                ))}
              </div>
              <div className="relative sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  className="h-11 pl-9"
                  placeholder="Buscar en el plan…"
                  aria-label="Buscar en el plan"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {visible.length === 0 ? (
              query ? (
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
              )
            ) : (
              <ul className="grid gap-3" aria-label="Plan semanal">
                {visible.map((item) => (
                  <PlanItemRow
                    key={item.itemId}
                    item={item}
                    onRegister={setRegistering}
                    onStatusChanged={refresh}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
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
