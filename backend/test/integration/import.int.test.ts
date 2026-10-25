import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { CompanyDetail, ImportJobDto, ImportRejectionDto, Paginated } from '@axiom/contracts';
import ExcelJS from 'exceljs';
import { bootApp, expectError, type TestApp } from '../support/app';
import { buildImportWorkbook, reorderLikeExcel, syntheticImportRows } from '../support/xlsx';

describe('importación de Excel', () => {
  let t: TestApp;
  let admin: string;
  const prefix = `IMP${Date.now().toString(36).toUpperCase()}`.slice(0, 12);

  beforeAll(async () => {
    t = await bootApp();
    admin = (await t.login('admin')).token;
  });
  afterAll(() => t.close());

  async function upload(buffer: Buffer, fileName = 'empresas-sinteticas.xlsx', token = admin) {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(buffer)], fileName));
    return t.api<{ jobId: number }>('POST', '/import', { token, form });
  }

  async function waitForJob(jobId: number): Promise<ImportJobDto> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const res = await t.api<ImportJobDto>('GET', `/import/${jobId}`, { token: admin });
      if (res.body.status === 'COMPLETADO' || res.body.status === 'FALLIDO') return res.body;
      await Bun.sleep(150);
    }
    throw new Error(`La importación ${jobId} no terminó a tiempo`);
  }

  const rows = () => [
    ...syntheticImportRows(prefix, 5),
    // mismo RUC con otra nómina → sucursal
    {
      ...syntheticImportRows(prefix, 1)[0],
      NOMBRE_COMERCIAL_NOMINA: 'Sucursal Sur',
      CANTIDAD_EMPLEADOS: 4,
    },
    // RUC faltante → rechazada
    { ...syntheticImportRows(`${prefix}X`, 1)[0], RUC: '' },
  ];

  test('importa un .xlsx sintético: inserta, agrupa sucursales y rechaza filas inválidas', async () => {
    const started = await upload(await buildImportWorkbook(rows()));
    expect(started.status).toBe(202);
    const job = await waitForJob(started.body.jobId);

    expect(job.status).toBe('COMPLETADO');
    expect(job.totalRows).toBe(7);
    expect(job.insertedCount).toBe(5);
    expect(job.branchCount).toBe(1);
    expect(job.rejectedCount).toBe(1);

    const rejections = await t.api<Paginated<ImportRejectionDto>>(
      'GET',
      `/import/${job.id}/rejections`,
      { token: admin },
    );
    expect(rejections.body.items).toHaveLength(1);
    expect(rejections.body.items[0]?.reason).toBe('RUC faltante');

    const found = await t.api<Paginated<{ id: number; ruc: string }>>(
      'GET',
      `/companies?q=${prefix}&pageSize=50`,
      {
        token: admin,
      },
    );
    expect(found.body.total).toBe(5);
    const first = found.body.items.find((c) => c.ruc === `${prefix}0001`);
    const detail = await t.api<CompanyDetail>('GET', `/companies/${first?.id}`, { token: admin });
    expect(detail.body.source).toBe('EXCEL');
    expect(detail.body.branches).toHaveLength(1);
    expect(detail.body.branches[0]?.tradeName).toBe('Sucursal Sur');
    expect(detail.body.activityName).toBe('ACTIVIDAD IMPORTADA DE PRUEBA');
    expect(detail.body.sectorName).toBe('PRIVADA NACIONAL');
  });

  test('reimportar el mismo archivo es idempotente: no duplica empresas ni sucursales', async () => {
    const buffer = await buildImportWorkbook(rows());
    const before = await t.api<Paginated<unknown>>('GET', `/companies?q=${prefix}&pageSize=50`, {
      token: admin,
    });

    const started = await upload(buffer);
    const job = await waitForJob(started.body.jobId);

    expect(job.status).toBe('COMPLETADO');
    expect(job.insertedCount).toBe(0);
    expect(job.branchCount).toBe(0);
    const after = await t.api<Paginated<unknown>>('GET', `/companies?q=${prefix}&pageSize=50`, {
      token: admin,
    });
    expect(after.body.total).toBe(before.body.total);
    const branches = await t.prisma.client.companyBranch.count({
      where: { company: { ruc: { startsWith: prefix } } },
    });
    expect(branches).toBe(1);
  });

  test('reimportar con datos cambiados actualiza la empresa existente', async () => {
    const changed = syntheticImportRows(prefix, 1).map((r) => ({ ...r, CANTIDAD_EMPLEADOS: 999 }));
    const job = await waitForJob((await upload(await buildImportWorkbook(changed))).body.jobId);
    expect(job.status).toBe('COMPLETADO');
    expect(job.updatedCount).toBe(1);
    const row = await t.prisma.client.company.findUniqueOrThrow({
      where: { ruc: `${prefix}0001` },
    });
    expect(row.employeeCount).toBe(999);
  });

  test('un libro sin las columnas obligatorias termina FALLIDO', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('X');
    sheet.addRow(['NOMBRE', 'EDAD']);
    sheet.addRow(['Juan', 30]);
    const buffer = await reorderLikeExcel(Buffer.from(await book.xlsx.writeBuffer()));
    const job = await waitForJob((await upload(buffer)).body.jobId);
    expect(job.status).toBe('FALLIDO');
    expect(job.errorMessage).toBeTruthy();
  });

  test('solo ADMIN importa, solo se aceptan .xlsx y hace falta el archivo', async () => {
    const buffer = await buildImportWorkbook(syntheticImportRows('NOPE', 1));
    const exec = (await t.login('exec1')).token;
    expectError(await upload(buffer, 'x.xlsx', exec), 403);
    expectError(await upload(buffer, 'datos.csv'), 400);
    expectError(await t.api('POST', '/import', { token: admin }), 400);
    expectError(await t.api('GET', '/import/99999999', { token: admin }), 404);
  });
});
