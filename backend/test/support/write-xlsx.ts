/**
 * CLI para las pruebas E2E: escribe un .xlsx sintético de importación.
 * Uso: bun test/support/write-xlsx.ts <archivo> <prefijoRuc> <cantidad>
 * (Playwright corre en Node y no puede cargar exceljs; por eso se genera en un proceso de Bun.)
 */
import { buildImportWorkbook, syntheticImportRows } from './xlsx';

const [file, prefix, count] = process.argv.slice(2);
if (!file || !prefix || !count)
  throw new Error('Uso: write-xlsx <archivo> <prefijoRuc> <cantidad>');
await Bun.write(file, await buildImportWorkbook(syntheticImportRows(prefix, Number(count))));
