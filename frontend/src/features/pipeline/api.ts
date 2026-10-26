import {
  type BoardDto,
  type CatalogItem,
  type ChangeStatusRequest,
  type Paginated,
  PIPELINE_STATUS_LABELS,
  type PipelineStateDto,
  type PipelineStatus,
  type RegisterInteractionRequest,
  type RegisterInteractionResultDto,
  type TimelineEntryDto,
} from '@axiom/contracts';
import {
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { companyKeys } from '@/features/companies/queries';
import { api } from '@/shared/api';
import { DEFAULT_PAGE_SIZE } from '@/shared/ui/pagination';
import { isConcurrencyError, pipelineErrorMessage } from './errors';

// ───────────────────────────── claves de caché ─────────────────────────────

export interface BoardFilters {
  q?: string;
  sectorId?: number;
  activityId?: number;
  limitPerColumn: number;
}

export const pipelineKeys = {
  all: ['pipeline'] as const,
  boards: () => ['pipeline', 'board'] as const,
  board: (filters: BoardFilters) => ['pipeline', 'board', filters] as const,
  state: (companyId: number) => ['pipeline', 'state', companyId] as const,
  timeline: (companyId: number) => ['pipeline', 'timeline', companyId] as const,
};

export const catalogKeys = {
  sectors: ['catalogs', 'sectors'] as const,
  activities: ['catalogs', 'activities'] as const,
};

/**
 * Clave del detalle de empresa (la comparte la ficha y la invalidan los cambios de estado).
 * Única fuente: `companyKeys.detail` de la feature companies, que usan sus diálogos de edición.
 */
export const companyDetailKey = (companyId: number) => companyKeys.detail(companyId);

// ───────────────────────────── lecturas ─────────────────────────────

export function boardQueryString(filters: BoardFilters): string {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.sectorId) p.set('sectorId', String(filters.sectorId));
  if (filters.activityId) p.set('activityId', String(filters.activityId));
  p.set('limitPerColumn', String(filters.limitPerColumn));
  return p.toString();
}

export function useBoard(filters: BoardFilters) {
  return useQuery({
    queryKey: pipelineKeys.board(filters),
    queryFn: ({ signal }) =>
      api.get<BoardDto>(`/pipeline/board?${boardQueryString(filters)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export const fetchPipelineState = (companyId: number, signal?: AbortSignal) =>
  api.get<PipelineStateDto>(`/pipeline/companies/${companyId}`, signal);

export function usePipelineState(companyId: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: pipelineKeys.state(companyId),
    queryFn: ({ signal }) => fetchPipelineState(companyId, signal),
    enabled: options.enabled ?? true,
    // El estado manda: siempre se revalida al abrir un menú o formulario.
    staleTime: 0,
  });
}

export const TIMELINE_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function useTimeline(companyId: number) {
  return useInfiniteQuery({
    queryKey: pipelineKeys.timeline(companyId),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<TimelineEntryDto>>(
        `/pipeline/companies/${companyId}/timeline?page=${pageParam}&pageSize=${TIMELINE_PAGE_SIZE}`,
        signal,
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

export function useSectors() {
  return useQuery({
    queryKey: catalogKeys.sectors,
    queryFn: ({ signal }) => api.get<CatalogItem[]>('/catalogs/sectors', signal),
    staleTime: 60 * 60_000,
  });
}

export function useActivities() {
  return useQuery({
    queryKey: catalogKeys.activities,
    queryFn: ({ signal }) => api.get<CatalogItem[]>('/catalogs/activities', signal),
    staleTime: 60 * 60_000,
  });
}

// ───────────────────────────── optimismo del tablero ─────────────────────────────

/** Mueve una tarjeta de columna en un BoardDto (puro; no muta el original). */
export function moveCardInBoard(board: BoardDto, companyId: number, to: PipelineStatus): BoardDto {
  const source = board.columns.find((c) => c.cards.some((card) => card.id === companyId));
  if (!source || source.status === to) return board;
  const card = source.cards.find((c) => c.id === companyId);
  if (!card) return board;
  return {
    columns: board.columns.map((col) => {
      if (col.status === source.status) {
        return {
          ...col,
          count: Math.max(0, col.count - 1),
          cards: col.cards.filter((c) => c.id !== companyId),
        };
      }
      if (col.status === to) return { ...col, count: col.count + 1, cards: [card, ...col.cards] };
      return col;
    }),
  };
}

function patchBoards(qc: QueryClient, fn: (b: BoardDto) => BoardDto) {
  qc.setQueriesData<BoardDto>({ queryKey: pipelineKeys.boards() }, (old) => (old ? fn(old) : old));
}

/** Invalida todo lo que depende del estado de una empresa. */
export function invalidateCompanyPipeline(qc: QueryClient, companyId: number) {
  void qc.invalidateQueries({ queryKey: pipelineKeys.boards() });
  void qc.invalidateQueries({ queryKey: pipelineKeys.state(companyId) });
  void qc.invalidateQueries({ queryKey: pipelineKeys.timeline(companyId) });
  void qc.invalidateQueries({ queryKey: companyDetailKey(companyId) });
}

// ───────────────────────────── escrituras ─────────────────────────────

export interface ChangeStatusVars extends ChangeStatusRequest {
  companyId: number;
}

/**
 * Cambia el estado con actualización optimista del tablero (si la tarjeta está en caché),
 * rollback ante error y toasts en español. Refresca el tablero, la ficha y la línea de tiempo.
 */
export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation<
    PipelineStateDto,
    unknown,
    ChangeStatusVars,
    { snapshot: [unknown, unknown][] }
  >({
    mutationFn: ({ companyId, ...body }) =>
      api.post<PipelineStateDto>(`/pipeline/companies/${companyId}/status`, body),
    onMutate: async ({ companyId, to }) => {
      await qc.cancelQueries({ queryKey: pipelineKeys.boards() });
      const snapshot = qc.getQueriesData<BoardDto>({ queryKey: pipelineKeys.boards() });
      patchBoards(qc, (b) => moveCardInBoard(b, companyId, to));
      return { snapshot: snapshot as [unknown, unknown][] };
    },
    onError: (err, _vars, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) {
        qc.setQueryData(key as readonly unknown[], data);
      }
      toast.error(pipelineErrorMessage(err));
      if (isConcurrencyError(err)) void qc.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onSuccess: (state) => {
      toast.success(`Estado actualizado: ${PIPELINE_STATUS_LABELS[state.status]}`);
    },
    onSettled: (_data, _err, vars) => invalidateCompanyPipeline(qc, vars.companyId),
  });
}

export interface RegisterInteractionVars extends RegisterInteractionRequest {
  companyId: number;
}

export function useRegisterInteraction() {
  const qc = useQueryClient();
  return useMutation<RegisterInteractionResultDto, unknown, RegisterInteractionVars>({
    mutationFn: ({ companyId, ...body }) =>
      api.post<RegisterInteractionResultDto>(`/pipeline/companies/${companyId}/interactions`, body),
    onError: (err) => {
      if (isConcurrencyError(err)) void qc.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onSettled: (_data, _err, vars) => invalidateCompanyPipeline(qc, vars.companyId),
  });
}
