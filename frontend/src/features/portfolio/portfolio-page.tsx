import { type AssignmentDto, normalizeSearchText } from '@axiom/contracts';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Briefcase,
  CalendarRange,
  PackagePlus,
  SearchX,
  Shuffle,
  UserMinus,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSessionStore } from '@/features/auth/session-store';
import { useRememberedTab } from '@/shared/hooks/use-remembered-tab';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import type { ComboboxOption } from '@/shared/ui/combobox';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { SearchInput } from '@/shared/ui/search-input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Skeleton } from '@/shared/ui/skeleton';
import { StatusBadge } from '@/shared/ui/status-badge';
import { TableSkeleton } from '@/shared/ui/table';
import { type TabItem, TabPanel, Tabs, useTabsId } from '@/shared/ui/tabs';
import { ASSIGNMENTS_PAGE_SIZE, useAssignments, useCurrentCycle } from './api';
import {
  BulkAssignDialog,
  ReassignDialog,
  ReleaseDialog,
  type SelectedCompany,
} from './assignment-dialogs';
import { CyclePanel, PortfolioStats } from './cycle-panel';
import { ExecutivePerformance } from './executive-performance';
import { RunWeeklyButton } from './run-weekly';
import { LastContact } from './status-cell';

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
      className="border-transparent bg-warning/12 text-warning"
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
        <StatusBadge status={a.status} />
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

const assignmentText = (a: AssignmentDto) =>
  `${a.legalName} ${a.tradeName ?? ''} ${a.userName} ${a.phone ?? ''}`;

const PORTFOLIO_TABS = ['ciclo', 'ejecutivos', 'empresas'] as const;
type PortfolioTab = (typeof PORTFOLIO_TABS)[number];

/** Esqueleto con la forma del ciclo: fila de indicadores y tira de 21 días. */
function CycleSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando ciclo" className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
          <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-sm lg:flex-row">
        <div className="w-48 shrink-0 space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex h-20 flex-1 gap-1.5">
          {Array.from({ length: 21 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
            <div key={i} className="flex-1 rounded-[5px] bg-track" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Esqueleto de las filas de rendimiento por ejecutivo. */
function RowsSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="divide-y rounded-xl border bg-card shadow-sm"
    >
      {Array.from({ length: 7 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
        <div key={i} className="flex items-center gap-6 px-5 py-4">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="w-44 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-1.5 flex-1 rounded-full md:block" />
          <Skeleton className="hidden h-1.5 flex-1 rounded-full md:block" />
        </div>
      ))}
    </div>
  );
}

export function PortfolioPage() {
  const user = useSessionStore((s) => s.user);
  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const isAdmin = user?.role === 'ADMIN';
  const isExecutive = user?.role === 'EJECUTIVO';

  const cycle = useCurrentCycle();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ASSIGNMENTS_PAGE_SIZE);
  const [executiveFilter, setExecutiveFilter] = useState<ComboboxOption | null>(null);
  const [query, setQuery] = useState('');
  const filterUserId = canManage && executiveFilter ? executiveFilter.id : undefined;
  const assignments = useAssignments(page, filterUserId, pageSize);
  const [tab, setTab] = useRememberedTab<PortfolioTab>('cartera', PORTFOLIO_TABS, 'ciclo');
  const tabsId = useTabsId();

  const [selection, setSelection] = useState<ReadonlyMap<number, string>>(new Map());
  const [reassigning, setReassigning] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [releasing, setReleasing] = useState<AssignmentDto | null>(null);

  const allExecutives = cycle.data?.executives ?? [];
  // El EJECUTIVO ve solo su fila (el backend ya lo acota; esto es defensa en profundidad).
  const executives = useMemo(() => {
    const all = cycle.data?.executives ?? [];
    return isExecutive ? all.filter((e) => e.userId === user?.id) : all;
  }, [cycle.data, isExecutive, user?.id]);
  const executiveOptions = useMemo<ComboboxOption[]>(
    () => (cycle.data?.executives ?? []).map((e) => ({ id: e.userId, name: e.fullName })),
    [cycle.data],
  );

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

  // El API no tiene búsqueda de texto en asignaciones: se filtra la página cargada.
  const pageItems = useMemo(() => {
    const items = assignments.data?.items ?? [];
    const q = normalizeSearchText(query);
    if (!q) return items;
    return items.filter((a) => normalizeSearchText(assignmentText(a)).includes(q));
  }, [assignments.data, query]);
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
      ...(isExecutive
        ? []
        : [
            {
              id: 'executive',
              header: 'Ejecutivo',
              enableSorting: false,
              meta: { className: 'whitespace-nowrap' },
              cell: ({ row }) => row.original.userName,
            } satisfies ColumnDef<AssignmentDto, unknown>,
          ]),
      {
        id: 'status',
        header: 'Estado',
        enableSorting: false,
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => <LastContact iso={row.original.lastContactAt} />,
      },
      {
        id: 'stalled',
        header: 'Sin avance',
        enableSorting: false,
        meta: { className: 'whitespace-nowrap' },
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
  }, [canManage, isExecutive, selection, allOnPage, someOnPage, toggle, togglePage]);

  const week = cycle.data?.week ?? null;
  const selected: SelectedCompany[] = [...selection].map(([id, name]) => ({ id, name }));

  const changeFilter = (option: ComboboxOption | null) => {
    setExecutiveFilter(option);
    setPage(1);
    setSelection(new Map());
  };

  const tabs: TabItem<PortfolioTab>[] = [
    { value: 'ciclo', label: 'Ciclo' },
    {
      value: 'ejecutivos',
      label: isExecutive ? 'Tu avance' : 'Ejecutivos',
      count: isExecutive || !week ? undefined : executives.length,
    },
    {
      value: 'empresas',
      label: isExecutive ? 'Mis empresas' : 'Empresas asignadas',
      count: assignments.data?.total,
    },
  ];

  const cycleBody = cycle.isPending ? (
    <CycleSkeleton />
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
  ) : null;

  return (
    <div>
      <PageHeader
        title="Cartera"
        description="Ciclo de rotación, cobertura por ejecutivo y empresas asignadas."
        actions={isAdmin ? <RunWeeklyButton /> : undefined}
      />

      <Tabs
        idBase={tabsId}
        label="Secciones de la cartera"
        items={tabs}
        value={tab}
        onValueChange={setTab}
        className="mb-6"
      />

      {tab === 'ciclo' && (
        <TabPanel idBase={tabsId} value="ciclo" className="grid gap-4">
          {cycleBody ?? (
            <>
              {executives.length > 0 && (
                <PortfolioStats executives={executives} showExecutiveCount={!isExecutive} />
              )}
              {week && <CyclePanel week={week} />}
            </>
          )}
        </TabPanel>
      )}

      {tab === 'ejecutivos' && (
        <TabPanel idBase={tabsId} value="ejecutivos">
          {cycle.isPending ? (
            <RowsSkeleton label="Cargando ejecutivos" />
          ) : (
            (cycleBody ??
            (executives.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Sin ejecutivos en el ciclo"
                description="No hay ejecutivos activos con cartera para mostrar."
              />
            ) : (
              <ExecutivePerformance executives={executives} self={isExecutive} />
            )))
          )}
        </TabPanel>
      )}

      {tab === 'empresas' && (
        <TabPanel idBase={tabsId} value="empresas">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <SearchInput
                  className="sm:w-72"
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Buscar en esta página…"
                  aria-label="Buscar en las empresas de esta página"
                />
                {canManage && (
                  <SearchableSelect
                    className="sm:w-60"
                    aria-label="Filtrar por ejecutivo"
                    placeholder="Todos los ejecutivos"
                    searchPlaceholder="Buscar ejecutivo…"
                    emptyText="Ningún ejecutivo coincide"
                    options={executiveOptions}
                    value={executiveFilter}
                    onChange={changeFilter}
                  />
                )}
              </div>
              {canManage && (
                <Button variant="outline" onClick={() => setBulkOpen(true)}>
                  <PackagePlus aria-hidden="true" /> Asignación masiva
                </Button>
              )}
            </div>
            {canManage && selection.size > 0 && (
              <div
                className="flex flex-wrap items-center gap-2 border-b bg-accent/60 px-5 py-2 text-sm"
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
              <TableSkeleton columns={6} rows={ASSIGNMENTS_PAGE_SIZE} />
            ) : assignments.isError && !assignments.data ? (
              <div className="p-5">
                <QueryError error={assignments.error} onRetry={() => void assignments.refetch()} />
              </div>
            ) : assignments.data && assignments.data.items.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Briefcase}
                  title="Sin asignaciones"
                  description="No hay empresas asignadas con este filtro."
                />
              </div>
            ) : assignments.data ? (
              <>
                {pageItems.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={SearchX}
                      title="Ninguna empresa de esta página coincide"
                      description="La búsqueda filtra la página cargada. Prueba otra página o limpia la búsqueda."
                      action={
                        <Button variant="outline" onClick={() => setQuery('')}>
                          Limpiar búsqueda
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <DataTable
                    columns={columns}
                    data={pageItems}
                    getRowId={(a) => String(a.id)}
                    isFetching={assignments.isFetching}
                    caption="Empresas asignadas"
                    renderCard={(a) => (
                      <AssignmentCard
                        a={a}
                        canManage={canManage}
                        showExecutive={!isExecutive}
                        selected={selection.has(a.companyId)}
                        onToggle={(on) => toggle(a, on)}
                        onRelease={() => setReleasing(a)}
                      />
                    )}
                  />
                )}
                <Pagination
                  page={assignments.data.page}
                  pageSize={pageSize}
                  total={assignments.data.total}
                  disabled={assignments.isFetching}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  itemLabel="empresas"
                />
              </>
            ) : null}
          </Card>
        </TabPanel>
      )}

      <ReassignDialog
        open={reassigning}
        onOpenChange={setReassigning}
        selection={selected}
        executives={allExecutives}
        onDone={() => setSelection(new Map())}
      />
      <BulkAssignDialog open={bulkOpen} onOpenChange={setBulkOpen} executives={allExecutives} />
      <ReleaseDialog assignment={releasing} onOpenChange={(o) => !o && setReleasing(null)} />
    </div>
  );
}
