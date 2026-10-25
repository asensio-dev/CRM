import { normalizePhone, normalizeRuc } from '@axiom/contracts';
import { COLUMNS, type CompanyCandidate, type ImportRow, LIMITS } from './import-row';

export const REJECTION_REASONS = {
  RUC_MISSING: 'RUC faltante',
  RUC_INVALID: 'RUC inválido (más de 20 caracteres)',
  LEGAL_NAME_MISSING: 'Razón social faltante',
} as const;
export type RejectionReason = (typeof REJECTION_REASONS)[keyof typeof REJECTION_REASONS];

export type NormalizeResult =
  | { ok: true; candidate: CompanyCandidate }
  | { ok: false; reason: RejectionReason };

const MAX_INT = 2_147_483_647;

/** Texto limpio: sin espacios sobrantes; vacío → null. Soporta celdas numéricas. */
function cleanText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).replace(/\s+/g, ' ').trim();
  return value.length > 0 ? value : null;
}

/**
 * Política de longitud: los textos que exceden la columna se RECORTAN (el máximo observado en el
 * Excel real cabe en las columnas, así que es un salvavidas, no un caso normal) y la fila se marca
 * como `truncated`. La excepción es la cédula: un valor recortado sería un identificador falso, por
 * eso se descarta (null) en vez de truncarse.
 */
function clip(value: string | null, max: number, flag: { truncated: boolean }): string | null {
  if (value === null || value.length <= max) return value;
  flag.truncated = true;
  return value.slice(0, max).trimEnd();
}

function normalizeEmployees(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > MAX_INT) return 0;
  return Math.floor(n);
}

/** La celda puede traer varios teléfonos ("2222 3333 / 8888 9999"): se usa el primero válido. */
function pickPhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return normalizePhone(raw);
  for (const part of String(raw).split(/[/,;]|\sy\s/i)) {
    const phone = normalizePhone(part);
    if (phone) return phone;
  }
  return null;
}

/** Fila cruda → candidato normalizado o motivo de rechazo. Función pura. */
export function normalizeRow(row: ImportRow): NormalizeResult {
  const cell = (name: string) => row.cells[name];

  const rawRuc = cleanText(cell(COLUMNS.ruc));
  if (rawRuc === null) return { ok: false, reason: REJECTION_REASONS.RUC_MISSING };
  const ruc = normalizeRuc(rawRuc);
  if (ruc === null) return { ok: false, reason: REJECTION_REASONS.RUC_INVALID };

  const legalNameRaw = cleanText(cell(COLUMNS.legalName));
  if (legalNameRaw === null) return { ok: false, reason: REJECTION_REASONS.LEGAL_NAME_MISSING };

  const flag = { truncated: false };
  const shippingAddress = clip(cleanText(cell(COLUMNS.shippingAddress)), LIMITS.address, flag);
  const particularAddress = clip(cleanText(cell(COLUMNS.particularAddress)), LIMITS.address, flag);
  const idNumber = cleanText(cell(COLUMNS.legalRepIdNumber));
  const idTooLong = idNumber !== null && idNumber.length > LIMITS.legalRepIdNumber;

  const candidate: CompanyCandidate = {
    rowNumber: row.rowNumber,
    ruc,
    legalName: clip(legalNameRaw, LIMITS.legalName, flag) as string,
    tradeName: clip(cleanText(cell(COLUMNS.tradeName)), LIMITS.tradeName, flag),
    legalRepName: clip(cleanText(cell(COLUMNS.legalRepName)), LIMITS.legalRepName, flag),
    legalRepIdNumber: idTooLong ? null : idNumber,
    employeeCount: normalizeEmployees(cell(COLUMNS.employeeCount)),
    phone: pickPhone(cell(COLUMNS.phone)),
    shippingAddress,
    particularAddress,
    address: shippingAddress ?? particularAddress,
    activityName: clip(cleanText(cell(COLUMNS.activity)), LIMITS.activity, flag),
    sectorName: clip(cleanText(cell(COLUMNS.sector)), LIMITS.sector, flag),
    truncated: false,
  };
  candidate.truncated = flag.truncated || idTooLong;
  return { ok: true, candidate };
}
