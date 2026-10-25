import type {
  ImportJobDto,
  ImportRejectionDto,
  ImportStartedResponse,
  Paginated,
} from '@axiom/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '@/shared/api';

export const IMPORT_POLL_MS = 2000;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const importKeys = {
  all: ['import'] as const,
  job: (id: number) => [...importKeys.all, 'job', id] as const,
  rejections: (id: number, page: number) => [...importKeys.all, 'rejections', id, page] as const,
};

export const isJobFinished = (job: ImportJobDto | undefined): boolean =>
  job?.status === 'COMPLETADO' || job?.status === 'FALLIDO';

/** Consulta el job cada 2 s hasta que termina (COMPLETADO / FALLIDO). */
export function useImportJob(id: number | null) {
  return useQuery({
    queryKey: importKeys.job(id ?? 0),
    queryFn: ({ signal }) => api.get<ImportJobDto>(`/import/${id}`, signal),
    enabled: id !== null,
    refetchInterval: (query) => (isJobFinished(query.state.data) ? false : IMPORT_POLL_MS),
  });
}

export const REJECTIONS_PAGE_SIZE = 20;

export function useImportRejections(id: number | null, page: number, enabled: boolean) {
  return useQuery({
    queryKey: importKeys.rejections(id ?? 0, page),
    queryFn: ({ signal }) =>
      api.get<Paginated<ImportRejectionDto>>(
        `/import/${id}/rejections?page=${page}&pageSize=${REJECTIONS_PAGE_SIZE}`,
        signal,
      ),
    enabled: id !== null && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useStartImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post<ImportStartedResponse>('/import', body);
    },
    onSuccess: () => {
      // El padrón cambia: los listados de empresas quedan obsoletos.
      void qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export interface ImportHistoryEntry {
  jobId: number;
  fileName: string;
  startedAt: string;
}

interface ImportHistoryState {
  entries: ImportHistoryEntry[];
  add: (entry: ImportHistoryEntry) => void;
}

/** Historial de importaciones iniciadas en esta sesión del navegador (solo en memoria). */
export const useImportHistory = create<ImportHistoryState>((set) => ({
  entries: [],
  add: (entry) => set((s) => ({ entries: [entry, ...s.entries].slice(0, 10) })),
}));

/** Valida un archivo antes de subirlo. Devuelve el mensaje de error o `null`. */
export function validateImportFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.xlsx')) return 'Solo se aceptan archivos .xlsx.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_UPLOAD_BYTES) return 'El archivo supera el máximo de 50 MB.';
  return null;
}
