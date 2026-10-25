import { z } from 'zod';

/**
 * API de importación (módulo import, solo ADMIN):
 *   POST /api/import                  multipart `file` (.xlsx, ≤ 50 MB) → 202 ImportStartedResponse
 *   GET  /api/import/:id              → ImportJobDto
 *   GET  /api/import/:id/rejections   ?page&pageSize → Paginated<ImportRejectionDto>
 * El procesamiento es asíncrono: el cliente consulta el job hasta COMPLETADO o FALLIDO.
 */
export const IMPORT_JOB_STATUSES = ['PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO'] as const;
export const ImportJobStatusSchema = z.enum(IMPORT_JOB_STATUSES);
export type ImportJobStatus = z.infer<typeof ImportJobStatusSchema>;

export interface ImportJobDto {
  id: number;
  fileName: string;
  status: ImportJobStatus;
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  branchCount: number;
  rejectedCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ImportRejectionDto {
  id: number;
  rowNumber: number;
  reason: string;
}

export interface ImportStartedResponse {
  jobId: number;
}
