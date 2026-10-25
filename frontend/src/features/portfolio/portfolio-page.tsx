import type { AssignmentDto, ExecutiveCoverageDto } from '@axiom/contracts';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Briefcase, CalendarRange, PackagePlus, Shuffle, UserMinus, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSessionStore } from '@/features/auth/session-store';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { Skeleton } from '@/shared/ui/skeleton';
import { TableSkeleton } from '@/shared/ui/table';
import { ASSIGNMENTS_PAGE_SIZE, useAssignments, useCurrentCycle } from './api';
import {
  BulkAssignDialog,
  ReassignDialog,
  ReleaseDialog,
  type SelectedCompany,
} from './assignment-dialogs';
import { formatLocalRange, percent } from './format';
import { ProgressBar } from './progress-bar';
import { RunWeeklyButton } from './run-weekly';
import { AnyStatusBadge, LastContact } from './status-cell';

const nf = new Intl.NumberFormat('es-NI');

function CompanyLink({ a }: { a: AssignmentDto }) {
  return (
    <Link
      to="/empresas/$companyId"
      params={{ companyId: a.companyId }}
      className="block max-w-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block truncate font-medium hover:underline">{a.legalName}</span>
      {a.tradeName && (
        <span className="block truncate text-xs text-muted-foreground">{a.tradeName}</span>
      )}
    </Link>
  );
}

function StalledBadge({ cycles }: { cycles: number }) {
  if (cycles <= 0) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
      title="Ciclos consecutivos sin avance en el pipeline"
    >
      {cycles} {cycles === 1 ? 'ciclo' : 'ciclos'} sin avance
    </Badge>
  );
}

/** Tarjeta móvil de una asignación (con selección y liberar para quien administra). */
function AssignmentCard({
  a,
  canManage,
  showExecutive,
  selected,
  onToggle,
  onRelease,
}: {
  a: AssignmentDto;
  canManage: boolean;
  showExecutive: boolean;
  selected: boolean;
  onToggle: (on: boolean) => void;
  onRelease: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-start gap-3">
        {canManage && (
          <Checkbox
            className="mt-1"
            aria-label={`Seleccionar ${a.legalName}`}
            checked={selected}
            onCheckedChange={(v) => onToggle(v === true)}
          />
        )}
        <div className="min-w-0 flex-1">
          <CompanyLink a={a} />
          <p className="text-xs text-muted-foreground">
            {showExecutive && `${a.userName} · `}
            {nf.format(a.employeeCount)} empleados
          </p>
        </div>
        <AnyStatusBadge status={a.status} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          Último contacto: <LastContact iso={a.lastContactAt} />
        </span>
        <StalledBadge cycles={a.cyclesWithoutProgress} />
      </div>
      {canManage && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          aria-label={`Liberar ${a.legalName}`}
          onClick={onRelease}
        >
          <UserMinus aria-hidden="true" /> Liberar
        </Button>
      )}
    </div>
  );
}

function ExecutiveCard({ e }: { e: ExecutiveCoverageDto }) {
  const planPct = e.plan ? percent(e.plan.contacted, e.plan.quota) : 0;
  return (
    <Card data-testid={`exec-${e.userId}`}>
      <CardHeader className="p-4 pb-2">
        <CardTitle>{e.fullName}</CardTitle>
        <CardDescription>
          Cartera: <span className="tabular-nums">{e.assigned}</span> /{' '}
          <span className="tabular-nums">{e.target}</span> empresas
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-2 text-sm">
        <div className="grid gap-1">
          <div className="flex justify-between">
            <span>Cobertura del ciclo</span>
            <span className="tabular-nums font-medium">
              {e.contactedThisCycle}/{e.assigned} · {Math.round(e.coveragePct)}%
            </span>
          </div>
          <ProgressBar
            value={e.contactedThisCycle}
            max={e.assigned}
            label={`Cobertura del ciclo de ${e.fullName}`}
            complete={e.assigned > 0 && e.contactedThisCycle >= e.assigned}
          />
        </div>
        <div className="grid gap-1">
          <div className="flex justify-between">
            <span>Plan de esta semana</span>
            <span className="tabular-nums font-medium">
              {e.plan ? `${e.plan.contacted}/${e.plan.quota} · ${planPct}%` : 'Sin plan'}
            </span>
          </div>
          {e.plan && (
            <ProgressBar
              value={e.plan.contacted}
              max={e.plan.quota}
              label={`Plan semanal de ${e.fullName}`}
              complete={e.plan.contacted >= e.plan.quota}
            />
          )}
        </div>
        <Link
          to="/mi-semana"
          search={{ userId: e.userId } as never}
          className="text-xs text-primary hover:underline"
        >
          Ver su semana
        </Link>
      </CardContent>
    </Card>
  );
}

export function PortfolioPage() {
  const user = useSessionStore((s) => s.user);
  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const isAdmin = user?.role === 'ADMIN';

  const cycle = useCurrentCycle();
  const [page, setPage] = useState(1);
  const [executiveFilter, setExecutiveFilter] = useState('');
  const filterUserId = canManage && executiveFilter ? Number(executiveFilter) : undefined;
  const assignments = useAssignments(page, filterUserId);

  const [selection, setSelection] = useState<ReadonlyMap<number, string>>(new Map());
  const [reassigning, setReassigning] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [releasing, setReleasing] = useState<AssignmentDto | null>(null);

  // El EJECUTIVO ve solo su fila (el backend ya lo acota; esto es defensa en profundidad).
  const executives = useMemo(() => {
    const all = cycle.data?.executives ?? [];
    return user?.role === 'EJECUTIVO' ? all.filter((e) => e.userId === user.id) : all;
  }, [cycle.data, user]);

  const toggle = useCallback(
    (a: AssignmentDto, on: boolean) =>
      setSelection((prev) => {
        const next = new Map(prev);
        if (on) next.set(a.companyId, a.legalName);
        else next.delete(a.companyId);
        return next;
      }),
    [],
  );

  const pageItems = useMemo(() => assignments.data?.items ?? [], [assignments.data]);
  const allOnPage = pageItems.length > 0 && pageItems.every((a) => selection.has(a.companyId));
  const someOnPage = pageItems.some((a) => selection.has(a.companyId));
  const togglePage = useCallback(
    (on: boolean) =>
      setSelection((prev) => {
        const next = new Map(prev);
        for (const a of pageItems) {
          if (on) next.set(a.companyId, a.legalName);
          else next.delete(a.companyId);
        }
        return next;
      }),
    [pageItems],
  );

  const columns = useMemo<ColumnDef<AssignmentDto, unknown>[]>(() => {
    const cols: ColumnDef<AssignmentDto, unknown>[] = [];
    if (canManage) {
      cols.push({
        id: 'select',
        enableSorting: false,
        meta: { className: 'w-10' },
        header: () => (
          <Checkbox
            aria-label="Seleccionar todas las de esta página"
            checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
            onCheckedChange={(v) => togglePage(v === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Seleccionar ${row.original.legalName}`}
            checked={selection.has(row.original.companyId)}
            onCheckedChange={(v) => toggle(row.original, v === true)}
          />
        ),
      });
    }
    cols.push(
      {
        id: 'company',
        header: 'Empresa',
        enableSorting: false,
        meta: { className: 'min-w-56' },
        cell: ({ row }) => <CompanyLink a={row.original} />,
      },
      ...(user?.role === 'EJECUTIVO'
        ? []
        : [
            {
              id: 'executive',
              header: 'Ejecutivo',
              enableSorting: false,
              cell: ({ row }) => row.original.userName,
            } satisfies ColumnDef<AssignmentDto, unknown>,
          ]),
      {
        id: 'status',
        header: 'Estado',
        enableSorting: false,
        cell: ({ row }) => <AnyStatusBadge status={row.original.status} />,
      },
      {
        id: 'employees',
        header: 'Empleados',
        enableSorting: false,
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="tabular-nums">{nf.format(row.original.employeeCount)}</span>
        ),
      },
      {
        id: 'lastContact',
        header: 'Último contacto',
        enableSorting: false,
        cell: ({ row }) => <LastContact iso={row.original.lastContactAt} />,
      },
      {
        id: 'stalled',
        header: 'Sin avance',
        enableSorting: false,
        cell: ({ row }) => <StalledBadge cycles={row.original.cyclesWithoutProgress} />,
      },
    );
    if (canManage) {
      cols.push({
        id: 'actions',
        header: () => <span className="sr-only">Acciones</span>,
        enableSorting: false,
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Liberar ${row.original.legalName}`}
            onClick={() => setReleasing(row.original)}
          >
            <UserMinus aria-hidden="true" /> Liberar
          </Button>
        ),
      });
    }
    return cols;
  }, [canManage, user?.role, selection, allOnPage, someOnPage, toggle, togglePage]);

  const week = cycle.data?.week ?? null;
  const selected: SelectedCompany[] = [...selection].map(([id, name]) => ({ id, name }));

  return (
    <div>
      <PageHeader
        title="Cartera"
        description="Ciclo de rotación, cobertura por ejecutivo y empresas asignadas."
        actions={
          <>
            {canManage && (
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                <PackagePlus aria-hidden="true" /> Asignación masiva
              </Button>
            )}
            {isAdmin && <RunWeeklyButton />}
          </>
        }
      />

      <section aria-label="Ciclo actual" className="mb-6 grid gap-4">
        {cycle.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : cycle.isError ? (
          <QueryError error={cycle.error} onRetry={() => void cycle.refetch()} />
        ) : !week ? (
          <EmptyState
            icon={CalendarRange}
            title="Aún no hay un ciclo activo"
            description={
              isAdmin
                ? 'Ejecuta la rotación semanal para abrir el primer ciclo, repartir las carteras y generar los planes.'
                : 'Un administrador debe ejecutar la rotación semanal para abrir el ciclo.'
            }
            action={isAdmin ? <RunWeeklyButton variant="default" /> : undefined}
          />
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ciclo actual</p>
                  <h2 className="text-xl font-semibold">Ciclo #{week.cycle.number}</h2>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">
                    Semana {week.weekNumber} de {week.totalWeeks}
                  </p>
                  <p className="text-muted-foreground">
                    {formatLocalRange(week.cycle.startDate, week.cycle.endDate)}
                  </p>
                </div>
              </CardContent>
            </Card>
            {executives.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Sin ejecutivos en el ciclo"
                description="No hay ejecutivos activos con cartera para mostrar."
              />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {executives.map((e) => (
                  <li key={e.userId}>
                    <ExecutiveCard e={e} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-label="Asignaciones">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
            <h2 className="text-base font-semibold">Empresas asignadas</h2>
            {canManage && (
              <div className="grid gap-1">
                <Label htmlFor="assignments-executive" className="text-xs">
                  Filtrar por ejecutivo
                </Label>
                <NativeSelect
                  id="assignments-executive"
                  className="min-w-52"
                  value={executiveFilter}
                  onChange={(e) => {
                    setExecutiveFilter(e.target.value);
                    setPage(1);
                    setSelection(new Map());
                  }}
                >
                  <option value="">Todos</option>
                  {(cycle.data?.executives ?? []).map((e) => (
                    <option key={e.userId} value={e.userId}>
                      {e.fullName}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          {canManage && selection.size > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 border-b bg-accent/50 px-4 py-2 text-sm"
              role="status"
            >
              <span className="font-medium">
                {selection.size} {selection.size === 1 ? 'seleccionada' : 'seleccionadas'}
              </span>
              <Button size="sm" onClick={() => setReassigning(true)}>
                <Shuffle aria-hidden="true" /> Reasignar a…
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelection(new Map())}>
                <X aria-hidden="true" /> Limpiar
              </Button>
            </div>
          )}
          {assignments.isPending ? (
            <TableSkeleton columns={6} rows={8} />
          ) : assignments.isError && !assignments.data ? (
            <QueryError error={assignments.error} onRetry={() => void assignments.refetch()} />
          ) : assignments.data && assignments.data.items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Briefcase}
                title="Sin asignaciones"
                description="No hay empresas asignadas con este filtro."
              />
            </div>
          ) : assignments.data ? (
            <>
              <DataTable
                columns={columns}
                data={assignments.data.items}
                getRowId={(a) => String(a.id)}
                isFetching={assignments.isFetching}
                caption="Empresas asignadas"
                renderCard={(a) => (
                  <AssignmentCard
                    a={a}
                    canManage={canManage}
                    showExecutive={user?.role !== 'EJECUTIVO'}
                    selected={selection.has(a.companyId)}
                    onToggle={(on) => toggle(a, on)}
                    onRelease={() => setReleasing(a)}
                  />
                )}
              />
              <Pagination
                page={assignments.data.page}
                pageSize={assignments.data.pageSize || ASSIGNMENTS_PAGE_SIZE}
                total={assignments.data.total}
                disabled={assignments.isFetching}
                onPageChange={setPage}
              />
            </>
          ) : null}
        </Card>
      </section>

      <ReassignDialog
        open={reassigning}
        onOpenChange={setReassigning}
        selection={selected}
        executives={cycle.data?.executives ?? []}
        onDone={() => setSelection(new Map())}
      />
      <BulkAssignDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        executives={cycle.data?.executives ?? []}
      />
      <ReleaseDialog assignment={releasing} onOpenChange={(o) => !o && setReleasing(null)} />
    </div>
  );
}
