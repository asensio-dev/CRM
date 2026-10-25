import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import { ImportDeduplicator } from '../../domain/import-deduplicator';
import type { CompanyCandidate } from '../../domain/import-row';
import { type ImportRow, missingColumns } from '../../domain/import-row';
import { normalizeRow } from '../../domain/normalize-row';
import {
  type BranchCandidate,
  COMPANY_IMPORT_WRITER,
  type CompanyImportWriter,
  IMPORT_JOB_REPOSITORY,
  type ImportBatch,
  type ImportCounters,
  type ImportJobRepository,
  type NewRejection,
  SPREADSHEET_ROW_SOURCE,
  type SpreadsheetRowSource,
} from '../../domain/ports';

/** Filas por lote. 100 empresas × ~14 columnas ≈ 1 400 parámetros < 2 100 (límite de SQL Server). */
export const IMPORT_BATCH_SIZE = 100;
/** Lotes escribiéndose a la vez (consultas de ~100 filas: la latencia por lote domina). */
export const WRITE_CONCURRENCY = 4;
/** El progreso del job se persiste cada N lotes. */
export const PROGRESS_EVERY_BATCHES = 10;
/** Tope de filas por importación (el Excel real tiene ~127 k): acota CPU, memoria y escrituras. */
export const MAX_IMPORT_ROWS = 500_000;

export interface ImportCompaniesInput {
  jobId: number;
  filePath: string;
  onProgress?: (summary: ImportSummary) => void;
  /** Por defecto MAX_IMPORT_ROWS. */
  maxRows?: number;
}

export interface ImportSummary {
  jobId: number;
  totalRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedManual: number;
  branchesInserted: number;
  branchesExisting: number;
  /** Filas idénticas a una ya vista para el mismo RUC (omitidas). */
  duplicateRows: number;
  truncatedRows: number;
  newActivities: number;
  rejected: number;
  rejectionsByReason: Record<string, number>;
  durationMs: number;
}

/** Orquesta fuente → normalización → deduplicación → escritura por lotes, registrando el job. */
@Injectable()
export class ImportCompaniesUseCase implements UseCase<ImportCompaniesInput, ImportSummary> {
  constructor(
    @Inject(SPREADSHEET_ROW_SOURCE) private readonly source: SpreadsheetRowSource,
    @Inject(COMPANY_IMPORT_WRITER) private readonly writer: CompanyImportWriter,
    @Inject(IMPORT_JOB_REPOSITORY) private readonly jobs: ImportJobRepository,
  ) {}

  async execute(input: ImportCompaniesInput): Promise<ImportSummary> {
    const startedAt = Date.now();
    const { jobId } = input;
    const maxRows = input.maxRows ?? MAX_IMPORT_ROWS;
    const dedup = new ImportDeduplicator();
    const s: ImportSummary = {
      jobId,
      totalRows: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skippedManual: 0,
      branchesInserted: 0,
      branchesExisting: 0,
      duplicateRows: 0,
      truncatedRows: 0,
      newActivities: 0,
      rejected: 0,
      rejectionsByReason: {},
      durationMs: 0,
    };
    const counters = (): ImportCounters => ({
      totalRows: s.totalRows,
      insertedCount: s.inserted,
      updatedCount: s.updated,
      branchCount: s.branchesInserted,
      rejectedCount: s.rejected,
    });

    let companies: CompanyCandidate[] = [];
    // Las sucursales se escriben al final: así todas las empresas ya existen y los lotes de
    // empresas pueden ir en paralelo sin depender del orden de las filas.
    const deferredBranches: BranchCandidate[] = [];
    let rejections: NewRejection[] = [];
    let completed = 0;
    let reported = 0;
    let headerChecked = false;

    const inFlight = new Set<Promise<void>>();
    let failure: unknown;
    const dispatch = async (batch: ImportBatch) => {
      const task: Promise<void> = this.writer
        .writeBatch(batch)
        .then((r) => {
          s.inserted += r.inserted;
          s.updated += r.updated;
          s.unchanged += r.unchanged;
          s.skippedManual += r.skippedManual;
          s.branchesInserted += r.branchesInserted;
          s.branchesExisting += r.branchesExisting;
          s.newActivities += r.newActivities;
          completed++;
        })
        .catch((error) => {
          failure ??= error;
        })
        .finally(() => inFlight.delete(task));
      inFlight.add(task);
      if (inFlight.size >= WRITE_CONCURRENCY) await Promise.race(inFlight);
      if (failure) throw failure;
    };
    const drain = async () => {
      await Promise.all(inFlight);
      if (failure) throw failure;
    };
    const flushRejections = async () => {
      if (rejections.length === 0) return;
      const pending = rejections;
      rejections = [];
      await this.jobs.addRejections(jobId, pending);
    };
    const reportProgress = async () => {
      if (completed - reported < PROGRESS_EVERY_BATCHES) return;
      reported = completed;
      await this.jobs.updateProgress(jobId, counters());
      input.onProgress?.({ ...s, durationMs: Date.now() - startedAt });
    };

    try {
      await this.jobs.markProcessing(jobId);

      for await (const row of this.source.rows(input.filePath)) {
        if (!headerChecked) {
          headerChecked = true;
          const missing = missingColumns(Object.keys(row.cells));
          if (missing.length > 0) {
            throw DomainError.validation(
              'IMPORT_MISSING_COLUMNS',
              `Faltan columnas obligatorias: ${missing.join(', ')}`,
            );
          }
        }
        s.totalRows++;
        if (s.totalRows > maxRows) {
          throw DomainError.validation(
            'IMPORT_TOO_MANY_ROWS',
            `El archivo supera el máximo de ${maxRows} filas por importación`,
          );
        }
        this.classify(row, dedup, s, {
          company: (c) => companies.push(c),
          branch: (b) => deferredBranches.push(b),
          rejection: (r) => rejections.push(r),
        });
        if (companies.length >= IMPORT_BATCH_SIZE) {
          const batch = companies;
          companies = [];
          await dispatch({ companies: batch, branches: [] });
          await reportProgress();
        }
        if (rejections.length >= IMPORT_BATCH_SIZE) await flushRejections();
      }
      if (companies.length > 0) await dispatch({ companies, branches: [] });
      await flushRejections();
      await drain();

      for (let i = 0; i < deferredBranches.length; i += IMPORT_BATCH_SIZE) {
        await dispatch({
          companies: [],
          branches: deferredBranches.slice(i, i + IMPORT_BATCH_SIZE),
        });
        await reportProgress();
      }
      await drain();

      s.durationMs = Date.now() - startedAt;
      await this.jobs.complete(jobId, counters());
      return s;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobs.fail(jobId, counters(), message.slice(0, 2000)).catch(() => undefined);
      throw error;
    }
  }

  private classify(
    row: ImportRow,
    dedup: ImportDeduplicator,
    s: ImportSummary,
    sink: {
      company: (c: CompanyCandidate) => void;
      branch: (b: BranchCandidate) => void;
      rejection: (r: NewRejection) => void;
    },
  ): void {
    const result = normalizeRow(row);
    if (!result.ok) {
      s.rejected++;
      s.rejectionsByReason[result.reason] = (s.rejectionsByReason[result.reason] ?? 0) + 1;
      sink.rejection({
        rowNumber: row.rowNumber,
        reason: result.reason,
        rawData: JSON.stringify(row.cells),
      });
      return;
    }
    const c = result.candidate;
    if (c.truncated) s.truncatedRows++;
    switch (dedup.classify(c)) {
      case 'COMPANY':
        sink.company(c);
        break;
      case 'BRANCH':
        sink.branch({
          ruc: c.ruc,
          rowNumber: c.rowNumber,
          tradeName: c.tradeName,
          address: c.address,
          phone: c.phone,
          employeeCount: c.employeeCount,
        });
        break;
      case 'DUPLICATE':
        s.duplicateRows++;
        break;
    }
  }
}
