import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  type AppointmentDto,
  normalizeSearchText,
} from '@axiom/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useSessionStore } from '@/features/auth/session-store';
import { useExecutives } from '@/features/dashboard/queries';
import { useDelayedFlag } from '@/shared/hooks/use-delayed-flag';
import { cn } from '@/shared/lib/cn';
import {
  addDays,
  dayStartIso,
  formatWeekRange,
  managuaDay,
  mondayOf,
  weekRangeIso,
} from '@/shared/lib/managua-time';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { SearchInput } from '@/shared/ui/search-input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Skeleton } from '@/shared/ui/skeleton';
import { AgendaWeek } from './agenda-view';
import { AppointmentCard, appointmentSearchText } from './appointment-card';
import { useAgenda, useAppointmentsList } from './queries';
import { ScheduleAppointmentDialog } from './schedule-dialog';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const id = z.coerce.number().int().positive().optional().catch(undefined);

/** Filas por página de la lista (el API admite hasta 100). */
export const APPOINTMENT_PAGE_SIZES = DEFAULT_PAGE_SIZE_OPTIONS;

export const appointmentsSearchSchema = z.object({
  view: z.enum(['agenda', 'lista']).default('agenda').catch('agenda'),
  /** Lunes de la semana mostrada (se normaliza al lunes). */
  week: day,
  userId: id,
  status: z.enum(APPOINTMENT_STATUSES).optional().catch(undefined),
  from: day,
  to: day,
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((n) => (APPOINTMENT_PAGE_SIZES as readonly number[]).includes(n))
    .default(DEFAULT_PAGE_SIZE)
    .catch(DEFAULT_PAGE_SIZE),
});
export type AppointmentsSearch = z.infer<typeof appointmentsSearchSchema>;

/** Filtra citas por texto (empresa, notas, lugar), sin tildes ni mayúsculas. */
export function filterAppointments(
  items: readonly AppointmentDto[],
  query: string | undefined,
): AppointmentDto[] {
  const q = normalizeSearchText(query ?? '');
  if (!q) return [...items];
  return items.filter((a) => normalizeSearchText(appointmentSearchText(a)).includes(q));
}

function useAppointmentsSearch() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const search = useMemo(() => appointmentsSearchSchema.parse(raw ?? {}), [raw]);
  const update = (patch: Partial<AppointmentsSearch>) =>
    navigate({
      to: '/citas',
      search: ((prev: Record<string, unknown>) => {
        const parsed = appointmentsSearchSchema.parse(prev);
        // Cambiar de filtro vuelve a la página 1 (salvo que el parche traiga su propia página).
        const next = { ...parsed, page: 1, ...patch };
        return {
          view: next.view === 'agenda' ? undefined : next.view,
          week: next.week,
          userId: next.userId || undefined,
          status: next.status || undefined,
          from: next.from || undefined,
          to: next.to || undefined,
          page: next.page === 1 ? undefined : next.page,
          pageSize: next.pageSize === DEFAULT_PAGE_SIZE ? undefined : next.pageSize,
        };
      }) as never,
      replace: true,
    });
  return { search, update };
}

function ExecutiveFilter({
  value,
  onChange,
}: {
  value?: number;
  onChange: (userId?: number) => void;
}) {
  // Los supervisores no pueden listar usuarios; el tablero ya expone a los ejecutivos con cartera.
  const executives = useExecutives({});
  const options = useMemo(
    () => (executives.data?.executives ?? []).map((x) => ({ id: x.userId, name: x.fullName })),
    [executives.data],
  );
  const selected = value
    ? (options.find((o) => o.id === value) ?? { id: value, name: `Ejecutivo ${value}` })
    : null;
  return (
    <div className="grid min-w-56 gap-1.5">
      <Label htmlFor="f-user">Ejecutivo</Label>
      <SearchableSelect
        id="f-user"
        value={selected}
        onChange={(o) => onChange(o?.id)}
        options={options}
        isLoading={executives.isPending}
        placeholder="Todos"
        searchPlaceholder="Buscar ejecutivo…"
        emptyText="Ningún ejecutivo coincide"
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando citas" className="space-y-3">
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}

interface SectionProps {
  search: AppointmentsSearch;
  update: (patch: Partial<AppointmentsSearch>) => void;
  /** Búsqueda por texto (empresa, notas, lugar). Se resuelve en cliente: el API no busca por texto. */
  query: string;
  onQueryChange: (q: string) => void;
}

function AgendaSection({
  search,
  update,
  today,
  query,
  onQueryChange,
}: SectionProps & { today: string }) {
  const monday = mondayOf(search.week ?? today);
  const range = useMemo(() => weekRangeIso(monday), [monday]);
  const agenda = useAgenda(range, search.userId);
  const agendaDimmed = useDelayedFlag(agenda.isFetching);
  const isCurrent = monday === mondayOf(today);
  // La agenda trae la semana completa: la búsqueda se resuelve en cliente sobre todas sus citas.
  const visible = useMemo(() => filterAppointments(agenda.data ?? [], query), [agenda.data, query]);
  const searching = !!query.trim();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border bg-card p-0.5 shadow-xs">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Semana anterior"
              onClick={() => update({ week: addDays(monday, -7) })}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Semana siguiente"
              onClick={() => update({ week: addDays(monday, 7) })}
            >
              <ChevronRight />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isCurrent}
            onClick={() => update({ week: undefined })}
          >
            Hoy
          </Button>
          <h2
            className="ml-1 text-base font-semibold tabular-nums"
            aria-live="polite"
            data-testid="week-label"
          >
            {formatWeekRange(monday)}
          </h2>
        </div>
        <SearchInput
          value={query}
          onValueChange={onQueryChange}
          placeholder="Buscar por empresa o notas…"
          aria-label="Buscar citas de la semana"
          className="sm:w-72"
        />
      </div>
      <div
        aria-busy={agenda.isFetching}
        className={cn('transition-opacity duration-200', agendaDimmed && 'opacity-70')}
      >
        {agenda.isPending ? (
          <ListSkeleton />
        ) : agenda.isError ? (
          <QueryError error={agenda.error} onRetry={() => agenda.refetch()} />
        ) : (
          <>
            <AgendaWeek monday={monday} appointments={visible} today={today} />
            {agenda.data.length === 0 ? (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                No hay citas esta semana.
              </p>
            ) : (
              searching && (
                <p className="mt-3 text-center text-sm text-muted-foreground" aria-live="polite">
                  {visible.length === 0
                    ? 'Ninguna cita de esta semana coincide con la búsqueda.'
                    : `${visible.length} de ${agenda.data.length} citas coinciden con la búsqueda.`}
                </p>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListSection({ search, update, query, onQueryChange }: SectionProps) {
  const filters = useMemo(
    () => ({
      page: search.page,
      pageSize: search.pageSize,
      status: search.status,
      userId: search.userId,
      from: search.from ? dayStartIso(search.from) : undefined,
      // `to` en pantalla es inclusivo; el API usa fin exclusivo.
      to: search.to ? dayStartIso(addDays(search.to, 1)) : undefined,
    }),
    [search.page, search.pageSize, search.status, search.userId, search.from, search.to],
  );
  const list = useAppointmentsList(filters);
  const listDimmed = useDelayedFlag(list.isFetching);
  const searching = !!query.trim();
  // El API pagina pero no busca por texto: la búsqueda filtra la página recibida.
  const items = useMemo(
    () => filterAppointments(list.data?.items ?? [], query),
    [list.data, query],
  );
  const hasFilters = !!(search.status || search.from || search.to);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b p-4">
        <div className="grid min-w-60 flex-1 gap-1.5">
          <Label htmlFor="f-q">Buscar</Label>
          <SearchInput
            id="f-q"
            value={query}
            onValueChange={onQueryChange}
            placeholder="Empresa o notas…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-status">Estado</Label>
          <NativeSelect
            id="f-status"
            value={search.status ?? ''}
            onChange={(e) =>
              update({ status: (e.target.value || undefined) as AppointmentsSearch['status'] })
            }
          >
            <option value="">Todos</option>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPOINTMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
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
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => update({ status: undefined, from: undefined, to: undefined })}
          >
            Limpiar filtros
          </Button>
        )}
      </div>
      {searching && list.data && list.data.total > list.data.items.length && (
        <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          La búsqueda filtra las citas de esta página; usa estado y fechas para acotar el resto.
        </p>
      )}
      {list.isPending ? (
        <div className="p-4">
          <ListSkeleton />
        </div>
      ) : list.isError ? (
        <div className="p-4">
          <QueryError error={list.error} onRetry={() => list.refetch()} />
        </div>
      ) : list.data.items.length === 0 || items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          className="rounded-none border-0 bg-transparent"
          title={
            list.data.items.length === 0
              ? 'No hay citas con estos filtros'
              : 'Ninguna cita coincide con la búsqueda'
          }
          description={
            list.data.items.length === 0
              ? 'Prueba con otro estado o rango de fechas.'
              : 'Prueba con otro nombre de empresa o palabra de las notas.'
          }
        />
      ) : (
        <ul
          aria-busy={list.isFetching}
          className={cn('divide-y transition-opacity duration-200', listDimmed && 'opacity-70')}
        >
          {items.map((a) => (
            <li key={a.id}>
              <AppointmentCard appointment={a} showDate />
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.total > 0 && (
        <Pagination
          page={list.data.page}
          pageSize={list.data.pageSize}
          total={list.data.total}
          onPageChange={(page) => update({ page })}
          onPageSizeChange={(pageSize) => update({ pageSize })}
          pageSizeOptions={APPOINTMENT_PAGE_SIZES}
          itemLabel="citas"
          disabled={list.isFetching}
        />
      )}
    </Card>
  );
}

export function AppointmentsPage() {
  const { search, update } = useAppointmentsSearch();
  const role = useSessionStore((s) => s.user?.role);
  const canPickExecutive = role === 'SUPERVISOR' || role === 'ADMIN';
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [query, setQuery] = useState('');
  const today = managuaDay();

  return (
    <div>
      <PageHeader
        title="Citas"
        description="Agenda semanal y seguimiento de citas con empresas."
        actions={
          <Button onClick={() => setScheduleOpen(true)}>
            <Plus aria-hidden="true" />
            Nueva cita
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div
          role="tablist"
          aria-label="Vista"
          className="inline-flex rounded-lg border bg-card p-1 shadow-xs"
        >
          {(['agenda', 'lista'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={search.view === v}
              onClick={() => update({ view: v })}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                search.view === v
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {v === 'agenda' ? 'Agenda semanal' : 'Lista'}
            </button>
          ))}
        </div>
        {canPickExecutive && (
          <ExecutiveFilter value={search.userId} onChange={(userId) => update({ userId })} />
        )}
      </div>
      {search.view === 'agenda' ? (
        <AgendaSection
          search={search}
          update={update}
          today={today}
          query={query}
          onQueryChange={setQuery}
        />
      ) : (
        <ListSection search={search} update={update} query={query} onQueryChange={setQuery} />
      )}
      <ScheduleAppointmentDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
    </div>
  );
}
