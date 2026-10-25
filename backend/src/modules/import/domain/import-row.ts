/** Fila cruda leída de la hoja: claves = encabezados en mayúsculas, valores sin tipar. */
export interface ImportRow {
  /** Número de fila en la hoja (1 = encabezado, los datos empiezan en 2). */
  rowNumber: number;
  cells: Record<string, unknown>;
}

export const COLUMNS = {
  ruc: 'RUC',
  legalName: 'RAZONSOCIAL_EMPRESA',
  legalRepIdNumber: 'CEDULA_REP_LEGAL',
  legalRepName: 'REPRESENTANTE_LEGAL',
  tradeName: 'NOMBRE_COMERCIAL_NOMINA',
  employeeCount: 'CANTIDAD_EMPLEADOS',
  shippingAddress: 'DIRECCION_ENVIO',
  particularAddress: 'DIRECCION_PARTICULAR',
  phone: 'TELEFONO',
  activity: 'ACTIVIDAD_ECONOMICA',
  sector: 'SECTOR_ECONOMICO',
} as const;

export const REQUIRED_COLUMNS = [COLUMNS.ruc, COLUMNS.legalName] as const;

/** Longitudes máximas de las columnas de destino (deben coincidir con schema.prisma). */
export const LIMITS = {
  legalName: 200,
  tradeName: 200,
  legalRepName: 100,
  legalRepIdNumber: 20,
  address: 300,
  activity: 200,
  sector: 60,
} as const;

/** Columnas obligatorias que no aparecen entre los encabezados de la hoja. */
export function missingColumns(headers: readonly string[]): string[] {
  const present = new Set(headers);
  return REQUIRED_COLUMNS.filter((c) => !present.has(c));
}

/** Datos de una sucursal (fila adicional con un RUC ya visto). */
export interface BranchData {
  tradeName: string | null;
  address: string | null;
  phone: string | null;
  employeeCount: number;
}

/** Fila válida y normalizada, lista para persistir. */
export interface CompanyCandidate extends BranchData {
  rowNumber: number;
  ruc: string;
  legalName: string;
  legalRepName: string | null;
  legalRepIdNumber: string | null;
  shippingAddress: string | null;
  particularAddress: string | null;
  activityName: string | null;
  sectorName: string | null;
  /** true si algún texto superó el límite de su columna y se recortó (o se descartó la cédula). */
  truncated: boolean;
}
