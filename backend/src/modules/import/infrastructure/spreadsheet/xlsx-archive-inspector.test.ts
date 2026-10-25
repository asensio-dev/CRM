import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DEFAULT_XLSX_LIMITS, inspectXlsxArchive } from './xlsx-archive-inspector';

let dir: string;

async function zipFile(name: string, entries: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const file = join(dir, name);
  await writeFile(file, data);
  return file;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'axiom-xlsx-guard-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('inspectXlsxArchive', () => {
  test('acepta un ZIP normal y cuenta entradas y bytes declarados', async () => {
    const file = await zipFile('ok.xlsx', {
      '[Content_Types].xml': '<Types/>',
      'xl/worksheets/sheet1.xml': '<row>1</row>'.repeat(100),
    });
    const result = await inspectXlsxArchive(file);
    // JSZip añade las carpetas (xl/, xl/worksheets/) como entradas vacías
    expect(result).toEqual({ ok: true, entries: 4, uncompressedBytes: 8 + 1200 });
  });

  test('rechaza un archivo que no es ZIP aunque se llame .xlsx', async () => {
    const file = join(dir, 'fake.xlsx');
    await writeFile(file, 'RUC,RAZON SOCIAL\n'.repeat(10));
    expect(await inspectXlsxArchive(file)).toEqual({
      ok: false,
      reason: 'El archivo no es un .xlsx válido',
    });
  });

  test('rechaza una bomba de compresión (ratio anómalo)', async () => {
    const file = await zipFile('bomb.xlsx', {
      'xl/worksheets/sheet1.xml': new Uint8Array(20 * 1024 * 1024), // 20 MB de ceros → ~20 KB
    });
    const result = await inspectXlsxArchive(file);
    expect(result).toEqual({ ok: false, reason: 'Compresión anómala en el .xlsx' });
  });

  test('rechaza si el total descomprimido o el número de entradas superan el límite', async () => {
    const file = await zipFile('big.xlsx', { a: 'x'.repeat(5000), b: 'y'.repeat(5000) });
    const tooBig = await inspectXlsxArchive(file, {
      ...DEFAULT_XLSX_LIMITS,
      maxUncompressedBytes: 8000,
    });
    expect(tooBig.ok).toBe(false);
    const tooMany = await inspectXlsxArchive(file, { ...DEFAULT_XLSX_LIMITS, maxEntries: 1 });
    expect(tooMany).toEqual({ ok: false, reason: 'Demasiadas entradas en el .xlsx' });
  });

  test('rechaza un ZIP truncado (sin directorio central)', async () => {
    const good = await zipFile('trunc-src.xlsx', { a: 'contenido' });
    const bytes = await Bun.file(good).bytes();
    const file = join(dir, 'trunc.xlsx');
    await writeFile(file, bytes.slice(0, 30));
    expect((await inspectXlsxArchive(file)).ok).toBe(false);
  });
});
