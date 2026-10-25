import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export const IMPORT_HEADERS = [
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
] as const;

export type ImportRowValues = Partial<Record<(typeof IMPORT_HEADERS)[number], string | number>>;

/** .xlsx sintético con los encabezados que espera la importación. */
export async function buildImportWorkbook(rows: ImportRowValues[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Empresas');
  sheet.addRow([...IMPORT_HEADERS]);
  for (const row of rows) sheet.addRow(IMPORT_HEADERS.map((h) => row[h] ?? null));
  return reorderLikeExcel(Buffer.from(await workbook.xlsx.writeBuffer()));
}

/**
 * ExcelJS escribe `xl/workbook.xml` al final del zip; Excel lo escribe antes que las hojas y el
 * lector en streaming de la importación lo necesita así. Se reempaqueta con el orden de Excel.
 */
export async function reorderLikeExcel(buffer: Buffer): Promise<Buffer> {
  const source = await JSZip.loadAsync(buffer);
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
  for (const name of ordered) {
    target.file(name, await (source.file(name) as JSZip.JSZipObject).async('uint8array'));
  }
  return Buffer.from(await target.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

/** Filas sintéticas: `count` empresas válidas con prefijo de RUC único + casos límite. */
export function syntheticImportRows(prefix: string, count: number): ImportRowValues[] {
  const rows: ImportRowValues[] = [];
  for (let i = 1; i <= count; i++) {
    rows.push({
      RUC: `${prefix}${String(i).padStart(4, '0')}`,
      RAZONSOCIAL_EMPRESA: `Importada Sintética ${prefix} ${i} S.A.`,
      CEDULA_REP_LEGAL: `001-020290-${String(i).padStart(4, '0')}Z`,
      REPRESENTANTE_LEGAL: `Representante ${i}`,
      NOMBRE_COMERCIAL_NOMINA: `Marca ${prefix} ${i}`,
      CANTIDAD_EMPLEADOS: 10 * i,
      DIRECCION_ENVIO: `Dirección de prueba ${i}`,
      TELEFONO: `2271${String(i).padStart(4, '0')}`,
      ACTIVIDAD_ECONOMICA: 'ACTIVIDAD IMPORTADA DE PRUEBA',
      SECTOR_ECONOMICO: 'PRIVADA NACIONAL',
    });
  }
  return rows;
}
