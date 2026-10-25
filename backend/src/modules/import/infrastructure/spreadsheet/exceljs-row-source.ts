import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { ImportRow } from '../../domain/import-row';
import type { SpreadsheetRowSource } from '../../domain/ports';

/** Celdas con formato (texto enriquecido, fórmulas, hipervínculos) → valor simple. */
function unwrap(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || value instanceof Date) return value;
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.richText)) {
    return (v.richText as { text?: string }[]).map((part) => part.text ?? '').join('');
  }
  if ('result' in v) return unwrap(v.result);
  if ('text' in v) return unwrap(v.text);
  if ('error' in v) return null;
  return String(value);
}

/**
 * Lectura en streaming (SAX) de la primera hoja: memoria constante aunque el libro tenga 100 k+ filas.
 * La primera fila son los encabezados; las filas totalmente vacías se ignoran.
 */
@Injectable()
export class ExcelJsRowSource implements SpreadsheetRowSource {
  async *rows(filePath: string): AsyncIterable<ImportRow> {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'ignore',
      worksheets: 'emit',
      entries: 'ignore',
    });

    for await (const worksheet of reader) {
      let headers: string[] | null = null;
      for await (const row of worksheet) {
        const values = row.values as unknown[];
        if (headers === null) {
          headers = [];
          for (let i = 1; i < values.length; i++) {
            headers[i] = String(unwrap(values[i]) ?? '')
              .trim()
              .toUpperCase();
          }
          continue;
        }
        const cells: Record<string, unknown> = {};
        let hasData = false;
        for (let i = 1; i < headers.length; i++) {
          const name = headers[i];
          if (!name) continue;
          let value = unwrap(values[i]);
          if (typeof value === 'string' && value.trim() === '') value = null;
          if (value !== null) hasData = true;
          cells[name] = value;
        }
        if (hasData) yield { rowNumber: row.number, cells };
      }
      return; // solo la primera hoja
    }
  }
}
