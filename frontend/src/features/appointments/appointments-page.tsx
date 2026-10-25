import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUSES } from '@axiom/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useSessionStore } from '@/features/auth/session-store';
import { useExecutives } from '@/features/dashboard/queries';
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
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { Skeleton } from '@/shared/ui/skeleton';
import { AgendaWeek } from './agenda-view';
import { AppointmentCard } from './appointment-card';
import { useAgenda, useAppointmentsList } from './queries';
import { ScheduleAppointmentDialog } from './schedule-dialog';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const id = z.coerce.number().int().positive().optional().catch(undefined);

export const appointmentsSearchSchema = z.object({
  view: z.enum(['agenda', 'lista']).default('agenda').catch('agenda'),
  /** Lunes de la semana mostrada (se normaliza al lunes). */
  week: day,
  userId: id,
  status: z.enum(APPOINTMENT_STATUSES).optional().catch(undefined),
  from: day,
  to: day,
  page: z.coerce.number().int().min(1).default(1).catch(1),
});
export type AppointmentsSearch = z.infer<typeof appointmentsSearchSchema>;

const PAGE_SIZE = 20;

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
  const options = useExecutives({});
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="f-user">Ejecutivo</Label>
      <NativeSelect
        id="f-user"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      >
        <option value="">Todos</option>
        {options.data?.executives.map((x) => (
          <option key={x.userId} value={x.userId}>
            {x.fullName}
          </option>
        ))}
      </NativeSelect>
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

function AgendaSection({
  search,
  update,
  today,
}: {
  search: AppointmentsSearch;
  update: (patch: Partial<AppointmentsSearch>) => void;
  today: string;
}) {
  const monday = mondayOf(search.week ?? today);
  const range = useMemo(() => weekRangeIso(monday), [monday]);
  const agenda = useAgenda(range, search.userId);
  const isCurrent = monday === mondayOf(today);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana anterior"
          onClick={() => update({ week: addDays(monday, -7) })}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana siguiente"
          onClick={() => update({ week: addDays(monday, 7) })}
        >
          <ChevronRight />
        </Button>
        <Button variant="outline" disabled={isCurrent} onClick={() => update({ week: undefined })}>
          Hoy
        </Button>
        <h2 className="ml-1 text-base font-semibold" aria-live="polite" data-testid="week-label">
          {formatWeekRange(monday)}
        </h2>
      </div>
      <div aria-busy={agenda.isFetching} className={cn(agenda.isFetching && 'opacity-70')}>
        {agenda.isPending ? (
          <ListSkeleton />
        ) : agenda.isError ? (
          <QueryError error={agenda.error} onRetry={() => agenda.refetch()} />
        ) : (
          <>
            <AgendaWeek monday={monday} appointments={agenda.data} today={today} />
            {agenda.data.length === 0 && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                No hay citas esta semana.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListSection({
  search,
  update,
}: {
  search: AppointmentsSearch;
  update: (patch: Partial<AppointmentsSearch>) => void;
}) {
  const filters = useMemo(
    () => ({
      page: search.page,
      pageSize: PAGE_SIZE,
      status: search.status,
      userId: search.userId,
      from: search.from ? dayStartIso(search.from) : undefined,
      // `to` en pantalla es inclusivo; el API usa fin exclusivo.
      to: search.to ? dayStartIso(addDays(search.to, 1)) : undefined,
    }),
    [search],
  );
  const list = useAppointmentsList(filters);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <QueryError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No hay citas con estos filtros"
          description="Prueba con otro estado o rango de fechas."
        />
      ) : (
        <div className={cn('rounded-lg border bg-card', list.isFetching && 'opacity-70')}>
          <ul className="divide-y">
            {list.data.items.map((a) => (
              <li key={a.id} className="p-3">
                <AppointmentCard appointment={a} showDate />
              </li>
            ))}
          </ul>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPageChange={(page) => update({ page })}
            disabled={list.isFetching}
          />
        </div>
      )}
    </div>
  );
}

export function AppointmentsPage() {
  const { search, update } = useAppointmentsSearch();
  const role = useSessionStore((s) => s.user?.role);
  const canPickExecutive = role === 'SUPERVISOR' || role === 'ADMIN';
  const [scheduleOpen, setScheduleOpen] = useState(false);
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
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div
          role="tablist"
          aria-label="Vista"
          className="inline-flex rounded-md border bg-card p-0.5"
        >
          {(['agenda', 'lista'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={search.view === v}
              onClick={() => update({ view: v })}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                search.view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
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
        <AgendaSection search={search} update={update} today={today} />
      ) : (
        <ListSection search={search} update={update} />
      )}
      <ScheduleAppointmentDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
    </div>
  );
}
