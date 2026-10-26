import { describe, expect, test } from 'bun:test';
import type { ImportRow } from '../../domain/import-row';
import type {
  BatchResult,
  CompanyImportWriter,
  ImportBatch,
  ImportCounters,
  ImportJobRecord,
  ImportJobRepository,
  NewRejection,
  SpreadsheetRowSource,
} from '../../domain/ports';
import { IMPORT_BATCH_SIZE, ImportCompaniesUseCase } from './import-companies.use-case';

const HEADERS = {
  RUC: null,
  RAZONSOCIAL_EMPRESA: null,
  TELEFONO: null,
  NOMBRE_COMERCIAL_NOMINA: null,
};

function rows(list: Record<string, unknown>[]): SpreadsheetRowSource {
  return {
    async *rows() {
      let n = 2;
      for (const cells of list)
        yield { rowNumber: n++, cells: { ...HEADERS, ...cells } } as ImportRow;
    },
  };
}

class MemoryWriter implements CompanyImportWriter {
  batches: ImportBatch[] = [];
  failOn: number | null = null;
  async writeBatch(batch: ImportBatch): Promise<BatchResult> {
    if (this.failOn === this.batches.length) throw new Error('boom');
    this.batches.push(batch);
    return {
      inserted: batch.companies.length,
      updated: 0,
      unchanged: 0,
      skippedManual: 0,
      branchesInserted: batch.branches.length,
      branchesExisting: 0,
      newActivities: 0,
    };
  }
}

class MemoryJobs implements ImportJobRepository {
  status = 'PENDIENTE';
  progress: ImportCounters[] = [];
  final: ImportCounters | null = null;
  error: string | null = null;
  rejections: NewRejection[] = [];
  async create(): Promise<ImportJobRecord> {
    throw new Error('no usado');
  }
  async findById(): Promise<ImportJobRecord | null> {
    return null;
  }
  async markProcessing() {
    this.status = 'PROCESANDO';
  }
  async updateProgress(_id: number, c: ImportCounters) {
    this.progress.push(c);
  }
  async complete(_id: number, c: ImportCounters) {
    this.status = 'COMPLETADO';
    this.final = c;
  }
  async fail(_id: number, c: ImportCounters, message: string) {
    this.status = 'FALLIDO';
    this.final = c;
    this.error = message;
  }
  async addRejections(_id: number, r: NewRejection[]) {
    this.rejections.push(...r);
  }
  async listRejections() {
    return { items: [], total: 0 };
  }
}

const company = (i: number, extra: Record<string, unknown> = {}) => ({
  RUC: `J${String(i).padStart(13, '0')}`,
  RAZONSOCIAL_EMPRESA: `Empresa ficticia ${i}`,
  ...extra,
});

function setup(list: Record<string, unknown>[]) {
  const writer = new MemoryWriter();
  const jobs = new MemoryJobs();
  const useCase = new ImportCompaniesUseCase(rows(list), writer, jobs);
  return { writer, jobs, useCase };
}

describe('ImportCompaniesUseCase', () => {
  test('separa empresas, sucursales, duplicados y rechazos; completa el job', async () => {
    const { writer, jobs, useCase } = setup([
      company(1, { NOMBRE_COMERCIAL_NOMINA: 'Matriz', TELEFONO: '22223333' }),
      company(1, { NOMBRE_COMERCIAL_NOMINA: 'Sucursal', TELEFONO: '22224444' }),
      company(1, { NOMBRE_COMERCIAL_NOMINA: 'Matriz', TELEFONO: '22223333' }), // duplicado
      company(2),
      { RUC: null, RAZONSOCIAL_EMPRESA: 'Sin RUC' },
      { RUC: 'J0000000000003', RAZONSOCIAL_EMPRESA: null },
    ]);

    const summary = await useCase.execute({ jobId: 7, filePath: 'x.xlsx' });

    expect(summary).toMatchObject({
      totalRows: 6,
      inserted: 2,
      branchesInserted: 1,
      duplicateRows: 1,
      rejected: 2,
    });
    expect(summary.rejectionsByReason).toEqual({ 'RUC faltante': 1, 'Razón social faltante': 1 });
    // empresas primero; las sucursales van al final, en un lote aparte
    expect(writer.batches).toHaveLength(2);
    expect(writer.batches[0]?.companies).toHaveLength(2);
    expect(writer.batches[1]?.branches[0]?.ruc).toBe('J0000000000001');
    expect(jobs.status).toBe('COMPLETADO');
    expect(jobs.final).toEqual({
      totalRows: 6,
      insertedCount: 2,
      updatedCount: 0,
      branchCount: 1,
      rejectedCount: 2,
    });
    expect(jobs.rejections.map((r) => r.rowNumber)).toEqual([6, 7]);
    expect(JSON.parse(jobs.rejections[0]?.rawData ?? '{}').RAZONSOCIAL_EMPRESA).toBe('Sin RUC');
  });

  test('divide en lotes y reporta progreso', async () => {
    const total = IMPORT_BATCH_SIZE * 25 + 5;
    const { writer, jobs, useCase } = setup(
      Array.from({ length: total }, (_, i) => company(i + 1)),
    );
    const progress: number[] = [];

    const summary = await useCase.execute({
      jobId: 1,
      filePath: 'x.xlsx',
      onProgress: (p) => progress.push(p.totalRows),
    });

    expect(summary.inserted).toBe(total);
    expect(writer.batches).toHaveLength(26);
    expect(writer.batches.every((b) => b.companies.length <= IMPORT_BATCH_SIZE)).toBe(true);
    expect(jobs.progress.length).toBeGreaterThanOrEqual(1);
    expect(progress).toHaveLength(jobs.progress.length);
  });

  test('falla el job si faltan columnas obligatorias', async () => {
    const writer = new MemoryWriter();
    const jobs = new MemoryJobs();
    const source: SpreadsheetRowSource = {
      async *rows() {
        yield { rowNumber: 2, cells: { TELEFONO: '22223333' } };
      },
    };
    const useCase = new ImportCompaniesUseCase(source, writer, jobs);

    await expect(useCase.execute({ jobId: 1, filePath: 'x.xlsx' })).rejects.toThrow(
      'Faltan columnas',
    );
    expect(jobs.status).toBe('FALLIDO');
    expect(jobs.error).toContain('RUC');
  });

  test('marca FALLIDO con los totales parciales si el writer lanza', async () => {
    const { writer, jobs, useCase } = setup(
      Array.from({ length: IMPORT_BATCH_SIZE + 1 }, (_, i) => company(i + 1)),
    );
    writer.failOn = 0;

    await expect(useCase.execute({ jobId: 1, filePath: 'x.xlsx' })).rejects.toThrow('boom');
    expect(jobs.status).toBe('FALLIDO');
    // El mensaje crudo no se persiste (podría traer datos personales).
    expect(jobs.error).toBe('Error interno durante la importación (código Error)');
    expect(jobs.error).not.toContain('boom');
  });

  test('errores con código (driver/Prisma) guardan solo el código, nunca el mensaje', async () => {
    const { writer, jobs, useCase } = setup(
      Array.from({ length: IMPORT_BATCH_SIZE + 1 }, (_, i) => company(i + 1)),
    );
    writer.writeBatch = async () => {
      throw Object.assign(new Error('Unique constraint failed on cedula 001-010190-0001A'), {
        code: 'P2002',
      });
    };
    await expect(useCase.execute({ jobId: 1, filePath: 'x.xlsx' })).rejects.toThrow();
    expect(jobs.error).toBe('Error interno durante la importación (código P2002)');
    expect(jobs.error).not.toContain('cedula');
  });

  test('falla el job si el archivo supera el tope de filas', async () => {
    const { jobs, useCase } = setup(Array.from({ length: 11 }, (_, i) => company(i + 1)));
    await expect(useCase.execute({ jobId: 1, filePath: 'x.xlsx', maxRows: 10 })).rejects.toThrow(
      'máximo de 10 filas',
    );
    expect(jobs.status).toBe('FALLIDO');
  });

  test('archivo sin filas de datos marca el job FALLIDO (no "COMPLETADO con 0 filas")', async () => {
    const { jobs, useCase } = setup([]);
    await expect(useCase.execute({ jobId: 1, filePath: 'x.xlsx' })).rejects.toThrow(
      'no tiene filas de datos',
    );
    expect(jobs.status).toBe('FALLIDO');
  });
});
