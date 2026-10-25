import type {
  CatalogItem,
  CompanyDetail,
  CompanyListItem,
  CreateBranch,
  CreateCompany,
  Paginated,
  UpdateCompany,
} from '@axiom/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { type CompaniesSearch, toApiQueryString } from './search';

/** Fábrica de claves de caché. T2.5 puede colgar aquí `detail(id)` para compartir caché con la ficha. */
export const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  list: (search: CompaniesSearch) => [...companyKeys.lists(), search] as const,
  details: () => [...companyKeys.all, 'detail'] as const,
  detail: (id: number) => [...companyKeys.details(), id] as const,
};

export const catalogKeys = {
  sectors: ['catalogs', 'sectors'] as const,
  activities: (q: string) => ['catalogs', 'activities', q] as const,
};

export function useCompaniesList(search: CompaniesSearch, enabled = true) {
  return useQuery({
    enabled,
    queryKey: companyKeys.list(search),
    queryFn: ({ signal }) =>
      api.get<Paginated<CompanyListItem>>(`/companies?${toApiQueryString(search)}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSectors() {
  return useQuery({
    queryKey: catalogKeys.sectors,
    queryFn: ({ signal }) => api.get<CatalogItem[]>('/catalogs/sectors', signal),
    staleTime: 10 * 60_000,
  });
}

/** Búsqueda asíncrona de actividades económicas (`?q=`). */
export function useActivities(q: string, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.activities(q),
    queryFn: ({ signal }) =>
      api.get<CatalogItem[]>(`/catalogs/activities?${new URLSearchParams(q ? { q } : {})}`, signal),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Guarda la ficha devuelta por el API en caché y refresca los listados. */
function useSyncDetail() {
  const qc = useQueryClient();
  return (detail: CompanyDetail) => {
    qc.setQueryData(companyKeys.detail(detail.id), detail);
    void qc.invalidateQueries({ queryKey: companyKeys.lists() });
  };
}

export function useCreateCompany() {
  const sync = useSyncDetail();
  return useMutation({
    mutationFn: (body: CreateCompany) => api.post<CompanyDetail>('/companies', body),
    onSuccess: sync,
  });
}

export function useUpdateCompany(id: number) {
  const sync = useSyncDetail();
  return useMutation({
    mutationFn: (body: UpdateCompany) => api.patch<CompanyDetail>(`/companies/${id}`, body),
    onSuccess: sync,
  });
}

export function useAddBranch(companyId: number) {
  const sync = useSyncDetail();
  return useMutation({
    mutationFn: (body: CreateBranch) =>
      api.post<CompanyDetail>(`/companies/${companyId}/branches`, body),
    onSuccess: sync,
  });
}
