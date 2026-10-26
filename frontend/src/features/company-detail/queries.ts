import type { Paginated, TimelineEntryDto } from '@axiom/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { pipelineKeys } from '@/features/pipeline/api';
import { api } from '@/shared/api';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/shared/ui/pagination';

export const TIMELINE_PAGE_SIZE_OPTIONS = DEFAULT_PAGE_SIZE_OPTIONS;

/**
 * Historial paginado por número de página. La clave cuelga de `pipelineKeys.timeline(id)`,
 * así que registrar un contacto o cambiar el estado (que invalidan ese prefijo) la refresca.
 */
export function useTimelinePage(companyId: number, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...pipelineKeys.timeline(companyId), 'page', page, pageSize] as const,
    queryFn: ({ signal }) =>
      api.get<Paginated<TimelineEntryDto>>(
        `/pipeline/companies/${companyId}/timeline?page=${page}&pageSize=${pageSize}`,
        signal,
      ),
    placeholderData: keepPreviousData,
    enabled: Number.isFinite(companyId),
  });
}
