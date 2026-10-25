import type {
  ChangeContractStatusRequest,
  ContractDto,
  ContractStatus,
  CreateContractRequest,
  Paginated,
  UpdateContractDraftRequest,
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

export interface ContractListFilters {
  page: number;
  pageSize: number;
  status?: ContractStatus;
  companyId?: number;
  startFrom?: string;
  startTo?: string;
}

export const contractKeys = {
  all: ['contracts'] as const,
  lists: () => [...contractKeys.all, 'list'] as const,
  list: (f: ContractListFilters) => [...contractKeys.lists(), f] as const,
  details: () => [...contractKeys.all, 'detail'] as const,
  detail: (id: number) => [...contractKeys.details(), id] as const,
};

export function listQueryString(f: ContractListFilters): string {
  const p = new URLSearchParams({ page: String(f.page), pageSize: String(f.pageSize) });
  if (f.status) p.set('status', f.status);
  if (f.companyId) p.set('companyId', String(f.companyId));
  if (f.startFrom) p.set('startFrom', f.startFrom);
  if (f.startTo) p.set('startTo', f.startTo);
  return p.toString();
}

export function useContracts(filters: ContractListFilters) {
  return useQuery({
    queryKey: contractKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Paginated<ContractDto>>(`/contracts?${listQueryString(filters)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useContract(id: number | null) {
  return useQuery({
    queryKey: contractKeys.detail(id ?? 0),
    queryFn: ({ signal }) => api.get<ContractDto>(`/contracts/${id}`, signal),
    enabled: id !== null,
  });
}

/** Refresca listas, detalle e indicadores (contratos activos y montos del tablero). */
function invalidateContracts(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: contractKeys.all });
  void qc.invalidateQueries({ queryKey: analyticsKeys.all });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContractRequest) => api.post<ContractDto>('/contracts', body),
    // Crear un contrato mueve la empresa a EN_PROCESO_CONTRATO.
    onSettled: (_data, _err, vars) => {
      invalidateContracts(qc);
      invalidateCompanyPipeline(qc, vars.companyId);
    },
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateContractDraftRequest & { id: number }) =>
      api.patch<ContractDto>(`/contracts/${id}`, body),
    onSettled: () => invalidateContracts(qc),
  });
}

/** ENVIADO y ACTIVO mueven la empresa en el pipeline: se refresca también su estado. */
export function useChangeContractStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ChangeContractStatusRequest & { id: number }) =>
      api.post<ContractDto>(`/contracts/${id}/status`, body),
    onSettled: (data, _err, vars) => {
      invalidateContracts(qc);
      const companyId = data?.companyId;
      if (companyId && (vars.to === 'ENVIADO' || vars.to === 'ACTIVO')) {
        invalidateCompanyPipeline(qc, companyId);
      }
    },
  });
}
