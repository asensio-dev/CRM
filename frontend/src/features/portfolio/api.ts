import type {
  AssignmentChangeResultDto,
  AssignmentDto,
  BulkAssignRequest,
  CurrentCycleDto,
  MyWeekDto,
  Paginated,
  ReassignRequest,
  ReleaseAssignmentRequest,
  RunWeeklyResultDto,
} from '@axiom/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/shared/api';
import { portfolioErrorMessage } from './errors';

export const ASSIGNMENTS_PAGE_SIZE = 20;

/** Claves de caché de cartera. Invalidar `all` refresca Mi semana, ciclo y asignaciones. */
export const portfolioKeys = {
  all: ['portfolio'] as const,
  myWeeks: () => ['portfolio', 'my-week'] as const,
  myWeek: (userId: number | undefined) => ['portfolio', 'my-week', userId ?? 'me'] as const,
  cycle: () => ['portfolio', 'cycle'] as const,
  assignmentsAll: () => ['portfolio', 'assignments'] as const,
  assignments: (page: number, userId: number | undefined) =>
    ['portfolio', 'assignments', { page, userId: userId ?? null }] as const,
};

export function useMyWeek(userId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.myWeek(userId),
    queryFn: ({ signal }) =>
      api.get<MyWeekDto>(
        `/portfolio/my-week${userId !== undefined ? `?userId=${userId}` : ''}`,
        signal,
      ),
    enabled,
    staleTime: 15_000,
  });
}

export function useCurrentCycle(enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.cycle(),
    queryFn: ({ signal }) => api.get<CurrentCycleDto>('/portfolio/cycles/current', signal),
    enabled,
    staleTime: 15_000,
  });
}

export function useAssignments(page: number, userId: number | undefined) {
  return useQuery({
    queryKey: portfolioKeys.assignments(page, userId),
    queryFn: ({ signal }) => {
      const p = new URLSearchParams({
        page: String(page),
        pageSize: String(ASSIGNMENTS_PAGE_SIZE),
      });
      if (userId !== undefined) p.set('userId', String(userId));
      return api.get<Paginated<AssignmentDto>>(`/portfolio/assignments?${p}`, signal);
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

function useInvalidatePortfolio() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: portfolioKeys.all });
}

export function useReassign() {
  const invalidate = useInvalidatePortfolio();
  return useMutation({
    mutationFn: (body: ReassignRequest) =>
      api.post<AssignmentChangeResultDto>('/portfolio/assignments/reassign', body),
    onError: (err) => toast.error(portfolioErrorMessage(err)),
    onSettled: invalidate,
  });
}

export function useBulkAssign() {
  const invalidate = useInvalidatePortfolio();
  return useMutation({
    mutationFn: (body: BulkAssignRequest) =>
      api.post<AssignmentChangeResultDto>('/portfolio/assignments/bulk', body),
    onError: (err) => toast.error(portfolioErrorMessage(err)),
    onSettled: invalidate,
  });
}

export function useReleaseAssignment() {
  const invalidate = useInvalidatePortfolio();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & ReleaseAssignmentRequest) =>
      api.post<AssignmentChangeResultDto>(`/portfolio/assignments/${id}/release`, body),
    onError: (err) => toast.error(portfolioErrorMessage(err)),
    onSettled: invalidate,
  });
}

export function useRunWeekly() {
  const invalidate = useInvalidatePortfolio();
  return useMutation({
    mutationFn: () => api.post<RunWeeklyResultDto>('/portfolio/run-weekly'),
    onError: (err) => toast.error(portfolioErrorMessage(err)),
    onSettled: invalidate,
  });
}
