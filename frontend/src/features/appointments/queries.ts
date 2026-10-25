import type {
  AppointmentDto,
  AppointmentStatus,
  CancelAppointmentRequest,
  CompleteAppointmentRequest,
  Paginated,
  RescheduleAppointmentRequest,
  RescheduleResultDto,
  ScheduleAppointmentRequest,
} from '@axiom/contracts';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { analyticsKeys } from '@/features/dashboard/queries';
import { invalidateCompanyPipeline } from '@/features/pipeline/api';
import { api } from '@/shared/api';

export interface AppointmentListFilters {
  page: number;
  pageSize: number;
  status?: AppointmentStatus;
  userId?: number;
  companyId?: number;
  /** ISO UTC, inicio inclusivo. */
  from?: string;
  /** ISO UTC, fin exclusivo. */
  to?: string;
}

export const appointmentKeys = {
  all: ['appointments'] as const,
  agendas: () => [...appointmentKeys.all, 'agenda'] as const,
  agenda: (from: string, to: string, userId?: number) =>
    [...appointmentKeys.agendas(), from, to, userId ?? null] as const,
  lists: () => [...appointmentKeys.all, 'list'] as const,
  list: (f: AppointmentListFilters) => [...appointmentKeys.lists(), f] as const,
};

export function listQueryString(f: AppointmentListFilters): string {
  const p = new URLSearchParams({ page: String(f.page), pageSize: String(f.pageSize) });
  if (f.status) p.set('status', f.status);
  if (f.userId) p.set('userId', String(f.userId));
  if (f.companyId) p.set('companyId', String(f.companyId));
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  return p.toString();
}

export function useAgenda(range: { from: string; to: string }, userId?: number) {
  return useQuery({
    queryKey: appointmentKeys.agenda(range.from, range.to, userId),
    queryFn: ({ signal }) => {
      const p = new URLSearchParams(range);
      if (userId) p.set('userId', String(userId));
      return api.get<AppointmentDto[]>(`/appointments/agenda?${p}`, signal);
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useAppointmentsList(filters: AppointmentListFilters) {
  return useQuery({
    queryKey: appointmentKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Paginated<AppointmentDto>>(`/appointments?${listQueryString(filters)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/** Refresca agendas, listas y los indicadores del tablero (citas de la semana). */
function invalidateAppointments(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: appointmentKeys.all });
  void qc.invalidateQueries({ queryKey: analyticsKeys.all });
}

/** Agendar mueve la empresa a AGENDANDO_CITA: también se refresca el pipeline y la ficha. */
export function useScheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ScheduleAppointmentRequest) =>
      api.post<AppointmentDto>('/appointments', body),
    onSettled: (_data, _err, vars) => {
      invalidateAppointments(qc);
      invalidateCompanyPipeline(qc, vars.companyId);
    },
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: RescheduleAppointmentRequest & { id: number }) =>
      api.post<RescheduleResultDto>(`/appointments/${id}/reschedule`, body),
    onSettled: () => invalidateAppointments(qc),
  });
}

export function useCompleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CompleteAppointmentRequest & { id: number }) =>
      api.post<AppointmentDto>(`/appointments/${id}/complete`, body),
    onSettled: () => invalidateAppointments(qc),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CancelAppointmentRequest & { id: number }) =>
      api.post<AppointmentDto>(`/appointments/${id}/cancel`, body),
    onSettled: () => invalidateAppointments(qc),
  });
}
