import { CONTRACT_STATUS_LABELS, CONTRACT_STATUSES, type ContractDto } from '@axiom/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { FileSignature, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { formatDayMonthYear } from '@/shared/lib/managua-time';
import { formatMoney } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { CompanyPicker } from '@/shared/ui/company-picker';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { TableSkeleton } from '@/shared/ui/table';
import { ContractDetailDialog, ContractStatusBadge } from './contract-detail-dialog';
import { CreateContractDialog } from './contract-form-dialog';
import { useContracts } from './queries';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const contractsSearchSchema = z.object({
  status: z.enum(CONTRACT_STATUSES).optional().catch(undefined),
  companyId: z.coerce.number().int().positive().optional().catch(undefined),
  companyName: z.string().max(200).optional().catch(undefined),
  startFrom: day,
  startTo: day,
  page: z.coerce.number().int().min(1).default(1).catch(1),
});
export type ContractsSearch = z.infer<typeof contractsSearchSchema>;

const PAGE_SIZE = 25;

function useContractsSearch() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const search = useMemo(() => contractsSearchSchema.parse(raw ?? {}), [raw]);
  const update = (patch: Partial<ContractsSearch>) =>
    navigate({
      to: '/contratos',
      search: ((prev: Record<string, unknown>) => {
        const next = { ...contractsSearchSchema.parse(prev), page: 1, ...patch };
        return {
          status: next.status || undefined,
          companyId: next.companyId || undefined,
          companyName: next.companyId ? next.companyName : undefined,
          startFrom: next.startFrom || undefined,
          startTo: next.startTo || undefined,
          page: next.page === 1 ? undefined : next.page,
        };
      }) as never,
      replace: true,
    });
  return { search, update };
}

const columns: ColumnDef<ContractDto, unknown>[] = [
  {
    id: 'code',
    header: 'Código',
    cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.code}</span>,
  },
  {
    id: 'company',
    header: 'Empresa',
    cell: ({ row }) => row.original.companyName ?? `Empresa ${row.original.companyId}`,
  },
  {
    id: 'amount',
    header: 'Monto',
    meta: { className: 'text-right' },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatMoney(row.original.amount, row.original.currency)}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Estado',
    cell: ({ row }) => <ContractStatusBadge status={row.original.status} />,
  },
  {
    id: 'dates',
    header: 'Vigencia',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDayMonthYear(row.original.startDate)} →{' '}
        {row.original.endDate ? formatDayMonthYear(row.original.endDate) : '—'}
      </span>
    ),
  },
];

export function ContractsPage() {
  const { search, update } = useContractsSearch();
  const [selected, setSelected] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filters = useMemo(
    () => ({
      page: search.page,
      pageSize: PAGE_SIZE,
      status: search.status,
      companyId: search.companyId,
      startFrom: search.startFrom,
      startTo: search.startTo,
    }),
    [search],
  );
  const list = useContracts(filters);
  const hasFilters = !!(search.status || search.companyId || search.startFrom || search.startTo);

  return (
    <div>
      <PageHeader
        title="Contratos"
        description="Seguimiento de contratos de venta, desde borrador hasta activo."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            Nuevo contrato
          </Button>
        }
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        aria-label="Filtros de contratos"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="f-status">Estado</Label>
          <NativeSelect
            id="f-status"
            value={search.status ?? ''}
            onChange={(e) =>
              update({ status: (e.target.value || undefined) as ContractsSearch['status'] })
            }
          >
            <option value="">Todos</option>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTRACT_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid min-w-56 gap-1.5">
          <Label htmlFor="f-company">Empresa</Label>
          <CompanyPicker
            id="f-company"
            value={
              search.companyId
                ? {
                    id: search.companyId,
                    name: search.companyName ?? `Empresa ${search.companyId}`,
                  }
                : null
            }
            onChange={(o) => update({ companyId: o?.id, companyName: o?.name })}
            placeholder="Todas"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-from">Inicio desde</Label>
          <Input
            id="f-from"
            type="date"
            value={search.startFrom ?? ''}
            max={search.startTo}
            onChange={(e) => update({ startFrom: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-to">Inicio hasta</Label>
          <Input
            id="f-to"
            type="date"
            value={search.startTo ?? ''}
            min={search.startFrom}
            onChange={(e) => update({ startTo: e.target.value || undefined })}
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() =>
              update({
                status: undefined,
                companyId: undefined,
                companyName: undefined,
                startFrom: undefined,
                startTo: undefined,
              })
            }
          >
            Limpiar filtros
          </Button>
        )}
      </form>

      {list.isPending ? (
        <TableSkeleton columns={5} rows={6} />
      ) : list.isError ? (
        <QueryError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={hasFilters ? 'No hay contratos con estos filtros' : 'Aún no hay contratos'}
          description={
            hasFilters
              ? 'Prueba quitando algún filtro.'
              : 'Crea el primero desde aquí o desde la ficha de una empresa.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <DataTable
            columns={columns}
            data={list.data.items}
            getRowId={(c) => String(c.id)}
            onRowClick={(c) => setSelected(c.id)}
            rowLabel={(c) => `Ver contrato ${c.code}`}
            isFetching={list.isFetching}
            caption="Contratos"
            renderCard={(c) => (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">{c.code}</span>
                  <ContractStatusBadge status={c.status} />
                </div>
                <p className="text-sm">{c.companyName ?? `Empresa ${c.companyId}`}</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatMoney(c.amount, c.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDayMonthYear(c.startDate)} →{' '}
                  {c.endDate ? formatDayMonthYear(c.endDate) : '—'}
                </p>
              </div>
            )}
          />
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPageChange={(page) => update({ page })}
            disabled={list.isFetching}
          />
        </div>
      )}

      <ContractDetailDialog contractId={selected} onClose={() => setSelected(null)} />
      <CreateContractDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(c) => setSelected(c.id)}
      />
    </div>
  );
}
