import type { CompanyListItem, CompanySortField } from '@axiom/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Building2, Plus, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { StatusBadge } from '@/shared/ui/status-badge';
import { TableSkeleton } from '@/shared/ui/table';
import { CreateCompanyDialog } from './company-dialogs';
import { CompanyFilters } from './company-filters';
import { useCompaniesList } from './queries';
import {
  COMPANIES_PAGE_SIZE,
  type CompaniesFilters,
  type CompaniesSearch,
  countActiveFilters,
  parseCompaniesSearch,
  toUrlSearch,
} from './search';

const nf = new Intl.NumberFormat('es-NI');

function LastContact({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">Sin contacto</span>;
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={format(date, "d 'de' MMMM yyyy, HH:mm", { locale: es })}>
      {formatDistanceToNow(date, { locale: es, addSuffix: true })}
    </time>
  );
}

const COLUMNS: ColumnDef<CompanyListItem, unknown>[] = [
  {
    id: 'ruc',
    header: 'RUC',
    enableSorting: false,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.ruc}</span>,
  },
  {
    id: 'legalName',
    header: 'Razón social',
    enableSorting: true,
    meta: { className: 'min-w-64' },
    cell: ({ row }) => (
      <div className="max-w-sm">
        <p className="truncate font-medium">{row.original.legalName}</p>
        {row.original.tradeName && (
          <p className="truncate text-xs text-muted-foreground">{row.original.tradeName}</p>
        )}
      </div>
    ),
  },
  {
    id: 'sector',
    header: 'Sector',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.sectorName ?? '—'}</span>
    ),
  },
  {
    id: 'employeeCount',
    header: 'Empleados',
    enableSorting: true,
    meta: { className: 'text-right' },
    cell: ({ row }) => (
      <span className="tabular-nums">{nf.format(row.original.employeeCount)}</span>
    ),
  },
  {
    id: 'phone',
    header: 'Teléfono',
    enableSorting: false,
    cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'status',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'lastContactAt',
    header: 'Último contacto',
    enableSorting: true,
    cell: ({ row }) => <LastContact iso={row.original.lastContactAt} />,
  },
];

function CompanyCard({ c }: { c: CompanyListItem }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{c.legalName}</p>
          {c.tradeName && <p className="truncate text-xs text-muted-foreground">{c.tradeName}</p>}
        </div>
        <StatusBadge status={c.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-mono">{c.ruc}</span> · {c.sectorName ?? 'Sin sector'} ·{' '}
        {nf.format(c.employeeCount)} empleados
      </p>
      <p className="text-xs text-muted-foreground">
        {c.phone ?? 'Sin teléfono'} · <LastContact iso={c.lastContactAt} />
      </p>
    </div>
  );
}

export function CompaniesPage() {
  const navigate = useNavigate();
  const raw = useSearch({ strict: false });
  const search = useMemo(() => parseCompaniesSearch(raw), [raw]);
  const [creating, setCreating] = useState(false);

  const setSearch = (next: CompaniesSearch) =>
    void navigate({ to: '/empresas', search: toUrlSearch(next) as never, replace: true });

  const rangeInvalid =
    search.minEmployees !== undefined &&
    search.maxEmployees !== undefined &&
    search.minEmployees > search.maxEmployees;
  const list = useCompaniesList(search, !rangeInvalid);

  const onFilters = (patch: Partial<CompaniesFilters>) =>
    setSearch({ ...search, ...patch, page: 1 });
  const clear = () =>
    setSearch(parseCompaniesSearch({ sortBy: search.sortBy, sortDir: search.sortDir }));

  const sorting: SortingState = [{ id: search.sortBy, desc: search.sortDir === 'desc' }];
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    const first = next[0];
    if (!first) return;
    setSearch({
      ...search,
      sortBy: first.id as CompanySortField,
      sortDir: first.desc ? 'desc' : 'asc',
      page: 1,
    });
  };

  const data = list.data;
  const filtered = countActiveFilters(search) > 0;

  return (
    <div>
      <PageHeader
        title="Empresas"
        description="Busca por RUC, razón social o nombre comercial y filtra el padrón."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nueva empresa
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <CompanyFilters search={search} onChange={onFilters} onClear={clear} />
        {list.isPending && !rangeInvalid ? (
          <TableSkeleton columns={COLUMNS.length} rows={10} />
        ) : list.isError && !data ? (
          <QueryError error={list.error} onRetry={() => void list.refetch()} />
        ) : data && data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={filtered ? SearchX : Building2}
              title={filtered ? 'Sin resultados' : 'Aún no hay empresas'}
              description={
                filtered
                  ? 'Ninguna empresa coincide con los filtros. Prueba con otros criterios.'
                  : 'Crea una empresa o importa el padrón desde Excel.'
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={clear}>
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : data ? (
          <>
            {list.isError && (
              <div
                className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
                role="alert"
              >
                No se pudo actualizar el listado.{' '}
                <button type="button" className="underline" onClick={() => void list.refetch()}>
                  Reintentar
                </button>
              </div>
            )}
            <DataTable
              columns={COLUMNS}
              data={data.items}
              getRowId={(c) => String(c.id)}
              sorting={sorting}
              onSortingChange={onSortingChange}
              isFetching={list.isFetching}
              caption="Listado de empresas"
              rowLabel={(c) => `Abrir ficha de ${c.legalName}`}
              onRowClick={(c) =>
                void navigate({ to: '/empresas/$companyId', params: { companyId: c.id } })
              }
              renderCard={(c) => <CompanyCard c={c} />}
            />
            <Pagination
              page={data.page}
              pageSize={data.pageSize || COMPANIES_PAGE_SIZE}
              total={data.total}
              disabled={list.isFetching}
              onPageChange={(page) => setSearch({ ...search, page })}
            />
          </>
        ) : null}
      </Card>
      <CreateCompanyDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
