import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ImportRow } from '../../domain/import-row';
import { normalizeRow } from '../../domain/normalize-row';
import { ExcelJsRowSource } from './exceljs-row-source';

const HEADER = [
  'RUC',
  'RAZONSOCIAL_EMPRESA',
  'CEDULA_REP_LEGAL',
  'REPRESENTANTE_LEGAL',
  'NOMBRE_COMERCIAL_NOMINA',
  'CANTIDAD_EMPLEADOS',
  'DIRECCION_ENVIO',
  'DIRECCION_PARTICULAR',
  'TELEFONO',
  'ACTIVIDAD_ECONOMICA',
  'SECTOR_ECONOMICO',
];

let dir: string;
let file: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'axiom-import-test-'));
  file = join(dir, 'sintetico.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Hoja1');
  sheet.addRow(HEADER);
  sheet.addRow([
    'J0000000000001',
    'Empresa Ficticia Uno',
    null,
    null,
    'Tienda Uno',
    5,
    'Calle Falsa 1',
    null,
    22223333,
    'COMERCIO',
    'PRIVADA NACIONAL',
  ]);
  sheet.addRow([
    1234567890123,
    'Compañía Ñandú Falsa',
    null,
    null,
    null,
    0,
    null,
    null,
    null,
    null,
    null,
  ]); // RUC numérico
  sheet.addRow([null, null, null, null, null, null, null, null, null, null, null]); // fila vacía
  sheet.addRow([null, 'Sin RUC Falsa', null, null, null, 1, null, null, null, null, null]);
  sheet.addRow([
    'J0000000000001',
    'Empresa Ficticia Uno',
    null,
    null,
    'Sucursal Dos',
    3,
    null,
    'Avenida 2',
    '8888-9999',
    'COMERCIO',
    'PRIVADA NACIONAL',
  ]);
  await workbook.xlsx.writeFile(file);
  await reorderLikeExcel(file);
});

/**
 * ExcelJS escribe `xl/workbook.xml` al final del zip; Excel lo escribe antes que las hojas y el
 * lector en streaming lo necesita así. Se reempaqueta con el orden de Excel para que el
 * fixture sea determinista y se parezca al archivo real.
 */
async function reorderLikeExcel(path: string): Promise<void> {
  const source = await JSZip.loadAsync(await Bun.file(path).arrayBuffer());
  const first = [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/sharedStrings.xml',
    'xl/styles.xml',
  ];
  const names = Object.keys(source.files).filter((n) => !source.files[n]?.dir);
  const ordered = [...first, ...names.filter((n) => !first.includes(n))].filter((n) =>
    names.includes(n),
  );
  const target = new JSZip();
  for (const name of ordered)
    target.file(name, await (source.file(name) as JSZip.JSZipObject).async('uint8array'));
  await Bun.write(path, await target.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function readAll(): Promise<ImportRow[]> {
  const out: ImportRow[] = [];
  for await (const row of new ExcelJsRowSource().rows(file)) out.push(row);
  return out;
}

describe('ExcelJsRowSource', () => {
  test('lee las filas de datos en streaming con claves de encabezado y número de fila', async () => {
    const rows = await readAll();
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3, 5, 6]); // la fila 4 está vacía
    expect(Object.keys(rows[0]?.cells ?? {})).toEqual(HEADER);
    expect(rows[0]?.cells.RAZONSOCIAL_EMPRESA).toBe('Empresa Ficticia Uno');
    expect(rows[0]?.cells.CEDULA_REP_LEGAL).toBeNull();
    expect(rows[1]?.cells.RUC).toBe(1234567890123);
  });

  test('las filas leídas se normalizan: rechazo sin RUC y sucursal con teléfono con guion', async () => {
    const results = (await readAll()).map(normalizeRow);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]).toMatchObject({ ok: true, candidate: { ruc: '1234567890123' } });
    expect(results[2]).toEqual({ ok: false, reason: 'RUC faltante' });
    expect(results[3]).toMatchObject({
      ok: true,
      candidate: { phone: '88889999', address: 'Avenida 2' },
    });
  });
});
