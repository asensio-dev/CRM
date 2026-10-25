import type { ImportJobStatus } from '@axiom/contracts';
import type { BranchData, CompanyCandidate, ImportRow } from './import-row';

/** Origen de filas crudas (adaptador: ExcelJS en streaming). */
export interface SpreadsheetRowSource {
  /** Emite las filas de datos de la primera hoja; las claves incluyen todos los encabezados. */
  rows(filePath: string): AsyncIterable<ImportRow>;
}
export const SPREADSHEET_ROW_SOURCE = Symbol('SpreadsheetRowSource');

export interface BranchCandidate extends BranchData {
  ruc: string;
  rowNumber: number;
}

export interface ImportBatch {
  /** Empresas nuevas del archivo (primera aparición de cada RUC). */
  companies: CompanyCandidate[];
  /** Filas adicionales de un RUC; su empresa está en este lote o en uno anterior. */
  branches: BranchCandidate[];
}

export interface BatchResult {
  inserted: number;
  updated: number;
  /** Empresas EXCEL existentes sin cambios. */
  unchanged: number;
  /** Empresas MANUAL existentes: no se tocan (ni sus sucursales). */
  skippedManual: number;
  branchesInserted: number;
  /** Sucursales que ya existían (re-ejecución). */
  branchesExisting: number;
  newActivities: number;
}

/** Persistencia masiva idempotente (adaptador Prisma; evita el dominio de companies por rendimiento). */
export interface CompanyImportWriter {
  writeBatch(batch: ImportBatch): Promise<BatchResult>;
}
export const COMPANY_IMPORT_WRITER = Symbol('CompanyImportWriter');

export interface ImportCounters {
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  branchCount: number;
  rejectedCount: number;
}

export interface ImportJobRecord extends ImportCounters {
  id: number;
  fileName: string;
  status: ImportJobStatus;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface ImportRejectionRecord {
  id: number;
  rowNumber: number;
  reason: string;
}

export interface NewRejection {
  rowNumber: number;
  reason: string;
  /** Fila original serializada; queda solo en la base de datos, nunca sale por la API. */
  rawData: string;
}

export interface ImportJobRepository {
  create(input: { fileName: string; createdById?: number | null }): Promise<ImportJobRecord>;
  findById(id: number): Promise<ImportJobRecord | null>;
  markProcessing(id: number): Promise<void>;
  updateProgress(id: number, counters: ImportCounters): Promise<void>;
  complete(id: number, counters: ImportCounters): Promise<void>;
  fail(id: number, counters: ImportCounters, message: string): Promise<void>;
  addRejections(jobId: number, rejections: NewRejection[]): Promise<void>;
  listRejections(
    jobId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: ImportRejectionRecord[]; total: number }>;
}
export const IMPORT_JOB_REPOSITORY = Symbol('ImportJobRepository');
