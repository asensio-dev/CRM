import { type CompanyBranchDto, type CompanyDetail, normalizeSearchText } from '@axiom/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  Clock,
  FileSignature,
  History,
  MessageSquarePlus,
  Pencil,
  Phone,
  Plus,
  SearchX,
  Store,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ScheduleAppointmentDialog } from '@/features/appointments';
import { AddBranchDialog, EditCompanyDialog } from '@/features/companies';
import { CreateContractDialog } from '@/features/contracts';
import { ChangeStatusMenu, RegisterContactDialog, usePipelineState } from '@/features/pipeline';
import { companyDetailKey } from '@/features/pipeline/api';
import { api, HttpError } from '@/shared/api';
import { useClientList } from '@/shared/hooks/use-client-list';
import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';
import { Button } from '@/shared/ui/button';
import { Card, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Pagination } from '@/shared/ui/pagination';
import { SearchInput } from '@/shared/ui/search-input';
import { Skeleton } from '@/shared/ui/skeleton';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { TIMELINE_PAGE_SIZE_OPTIONS, useTimelinePage } from './queries';
import { Timeline, timelineEntryText } from './timeline';

const nf = new Intl.NumberFormat('es-NI');

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

/** Dato clave del encabezado de la ficha. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-5 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium tabular-nums">
        {children ?? <span className="font-normal text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

/** Cabecera de una sección (título + contador a la izquierda, herramientas a la derecha). */
function SectionToolbar({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
      <CardTitle className="flex items-center gap-2">
        {title}
        {count !== undefined && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {nf.format(count)}
          </span>
        )}
      </CardTitle>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" className="space-y-5" aria-busy="true" aria-label="Cargando empresa">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

const branchText = (b: CompanyBranchDto) => [b.tradeName, b.address, b.phone].join(' ');

function BranchesSection({ branches, onAdd }: { branches: CompanyBranchDto[]; onAdd: () => void }) {
  const list = useClientList(branches, { searchText: branchText, pageSize: 10 });
  return (
    <Card className="overflow-hidden">
      <SectionToolbar title="Sucursales" count={branches.length}>
        {branches.length > 0 && (
          <SearchInput
            value={list.query}
            onValueChange={list.setQuery}
            placeholder="Buscar sucursal"
            aria-label="Buscar sucursales"
            className="w-full sm:w-56"
          />
        )}
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Agregar sucursal
        </Button>
      </SectionToolbar>
      {branches.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Esta empresa no tiene sucursales.</p>
      ) : list.total === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Ninguna sucursal coincide con «{list.query}».
        </p>
      ) : (
        <>
          <Table aria-label="Sucursales">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nombre comercial</TableHead>
                <TableHead className="hidden sm:table-cell">Dirección</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-right">Empleados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.pageItems.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {b.tradeName ?? 'Sucursal'}
                    </span>
                    {b.address && (
                      <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                        {b.address}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {b.address ?? '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">{b.phone ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {nf.format(b.employeeCount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            pageSizeOptions={[10, 25, 50]}
            itemLabel="sucursales"
          />
        </>
      )}
    </Card>
  );
}

function TimelineSection({ companyId }: { companyId: number }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(TIMELINE_PAGE_SIZE_OPTIONS[0]);
  const [query, setQuery] = useState('');
  const q = useTimelinePage(companyId, page, pageSize);
  const items = q.data?.items ?? [];
  const needle = normalizeSearchText(query);
  // El API no filtra el historial por texto: la búsqueda se aplica a la página cargada.
  const visible = needle
    ? items.filter((e) => normalizeSearchText(timelineEntryText(e)).includes(needle))
    : items;
  const total = q.data?.total ?? 0;

  return (
    <Card className="overflow-hidden">
      <SectionToolbar title="Historial" count={q.data ? total : undefined}>
        {total > 0 && (
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Filtrar esta página"
            aria-label="Filtrar historial"
            className="w-full sm:w-56"
          />
        )}
      </SectionToolbar>
      {q.isPending ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : q.isError && !q.data ? (
        <div className="p-5 text-sm">
          <p className="mb-2 text-destructive">No se pudo cargar el historial.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={History}
          title="Sin historial"
          description="Aún no hay contactos ni cambios de estado."
          className="border-0 bg-transparent py-10"
        />
      ) : (
        <>
          <div
            className={q.isFetching ? 'p-5 opacity-60 transition-opacity' : 'p-5'}
            aria-busy={q.isFetching}
          >
            {visible.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <SearchX className="size-4" aria-hidden="true" />
                Nada en esta página coincide con «{query}».
              </p>
            ) : (
              <Timeline entries={visible} />
            )}
          </div>
          <Pagination
            page={q.data?.page ?? page}
            pageSize={pageSize}
            total={total}
            disabled={q.isFetching}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizeOptions={TIMELINE_PAGE_SIZE_OPTIONS}
            itemLabel="eventos"
          />
        </>
      )}
    </Card>
  );
}

export function CompanyDetailPage() {
  const params = useParams({ strict: false }) as { companyId?: number | string };
  const companyId = Number(params.companyId);
  const [contactOpen, setContactOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

  const company = useQuery({
    queryKey: companyDetailKey(companyId),
    queryFn: ({ signal }) => api.get<CompanyDetail>(`/companies/${companyId}`, signal),
    enabled: Number.isFinite(companyId),
  });
  const state = usePipelineState(companyId);

  if (company.isPending) return <DetailSkeleton />;
  if (company.isError || !company.data) {
    const notFound = company.error instanceof HttpError && company.error.statusCode === 404;
    return (
      <EmptyState
        icon={Building2}
        title={notFound ? 'Empresa no encontrada' : 'No se pudo cargar la empresa'}
        description={notFound ? 'Puede que haya sido eliminada.' : 'Intenta de nuevo.'}
        action={
          notFound ? (
            <Button asChild>
              <Link to="/empresas">Volver a empresas</Link>
            </Button>
          ) : (
            <Button onClick={() => company.refetch()}>Reintentar</Button>
          )
        }
      />
    );
  }

  const c = company.data;
  const status = state.data?.status ?? c.status;
  const lastContactAt = state.data?.lastContactAt ?? c.lastContactAt;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/empresas">
          <ArrowLeft aria-hidden="true" />
          Empresas
        </Link>
      </Button>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground sm:flex">
              <Building2 className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]">
                  {c.legalName}
                </h1>
                <StatusBadge status={status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {c.tradeName && <span className="text-foreground">{c.tradeName} · </span>}
                RUC <span className="font-mono">{c.ruc}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden="true" />
              Editar empresa
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAppointmentOpen(true)}>
              <CalendarPlus aria-hidden="true" />
              Agendar cita
            </Button>
            <Button variant="outline" size="sm" onClick={() => setContractOpen(true)}>
              <FileSignature aria-hidden="true" />
              Crear contrato
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
          <Fact label="Teléfono">
            {c.phone ? (
              <a
                href={`tel:${c.phone}`}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {c.phone}
              </a>
            ) : null}
          </Fact>
          <Fact label="Empleados">{nf.format(c.employeeCount)}</Fact>
          <Fact label="Sector">{c.sectorName}</Fact>
          <Fact label="Último contacto">
            {lastContactAt ? (
              <time dateTime={lastContactAt} title={formatAbsolute(lastContactAt)}>
                {formatRelative(lastContactAt)}
              </time>
            ) : (
              <span className="font-normal text-muted-foreground">Sin contacto</span>
            )}
          </Fact>
        </dl>
        {/* Los diálogos escriben en companyKeys.detail(id), la misma clave que usa esta ficha */}
        <EditCompanyDialog company={c} open={editOpen} onOpenChange={setEditOpen} />
        <AddBranchDialog companyId={c.id} open={branchOpen} onOpenChange={setBranchOpen} />
        <ScheduleAppointmentDialog
          companyId={c.id}
          companyName={c.legalName}
          open={appointmentOpen}
          onOpenChange={setAppointmentOpen}
        />
        <CreateContractDialog
          companyId={c.id}
          companyName={c.legalName}
          open={contractOpen}
          onOpenChange={setContractOpen}
        />
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card className="overflow-hidden">
            <SectionToolbar title="Datos de la empresa" />
            <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
              <Field label="Actividad económica">{c.activityName}</Field>
              <Field label="Representante legal">{c.legalRepName}</Field>
              {c.legalRepIdNumber !== undefined && (
                <Field label="Cédula del representante">{c.legalRepIdNumber}</Field>
              )}
              <Field label="Dirección de envío">{c.shippingAddress}</Field>
              <Field label="Dirección particular">{c.particularAddress}</Field>
              <Field label="Origen">
                {c.source === 'EXCEL' ? 'Importación Excel' : 'Alta manual'}
              </Field>
              <Field label="Registrada">
                <time dateTime={c.createdAt}>{formatAbsolute(c.createdAt)}</time>
              </Field>
            </dl>
          </Card>

          <BranchesSection branches={c.branches} onAdd={() => setBranchOpen(true)} />

          <TimelineSection companyId={companyId} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <SectionToolbar title="Estado del pipeline" />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status} />
              </div>
              <p
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                title={lastContactAt ? formatAbsolute(lastContactAt) : undefined}
              >
                <Clock className="size-3.5" aria-hidden="true" />
                {lastContactAt
                  ? `Último contacto ${formatRelative(lastContactAt)}`
                  : 'Sin contacto registrado'}
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => setContactOpen(true)}>
                  <MessageSquarePlus aria-hidden="true" />
                  Registrar contacto
                </Button>
                <ChangeStatusMenu
                  companyId={companyId}
                  companyName={c.legalName}
                  state={state.data}
                  variant="outline"
                  size="default"
                />
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <RegisterContactDialog
        companyId={companyId}
        companyName={c.legalName}
        open={contactOpen}
        onOpenChange={setContactOpen}
      />
    </div>
  );
}
