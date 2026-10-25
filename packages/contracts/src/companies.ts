import { z } from 'zod';
import { PaginationQuerySchema } from './common';
import { type PipelineStatus, PipelineStatusSchema } from './pipeline';

/**
 * Normalización compartida por el alta manual (companies), la importación (import) y el frontend.
 * El Excel trae RUC como texto o como número; siempre se guarda como texto en mayúsculas sin espacios.
 */
export function normalizeRuc(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim().replace(/[\s-]/g, '').toUpperCase();
  return value.length > 0 && value.length <= 20 ? value : null;
}

/** Teléfono solo con dígitos (y `+` inicial). Devuelve null si queda vacío o es implausible. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw)
    .trim()
    .replace(/(?!^\+)[^\d]/g, '');
  return value.replace('+', '').length >= 7 && value.length <= 20 ? value : null;
}

export const RucSchema = z.string().transform((v, ctx) => {
  const ruc = normalizeRuc(v);
  if (!ruc) ctx.addIssue({ code: 'custom', message: 'RUC inválido' });
  return ruc ?? '';
});

// ───────────────────────────── API de empresas (módulo companies) ─────────────────────────────
//   GET   /api/companies               CompanySearchQuery → Paginated<CompanyListItem>
//   GET   /api/companies/:id           → CompanyDetail (con sucursales; cédula solo ADMIN/SUPERVISOR)
//   POST  /api/companies               CreateCompany → CompanyDetail (estado POR_CONTACTAR, source MANUAL)
//   PATCH /api/companies/:id           UpdateCompany → CompanyDetail (no cambia estado ni RUC)
//   POST  /api/companies/:id/branches  CreateBranch → CompanyDetail
//   GET   /api/catalogs/sectors        → CatalogItem[]
//   GET   /api/catalogs/activities     CatalogQuery → CatalogItem[]

export const COMPANY_SORT_FIELDS = [
  'legalName',
  'employeeCount',
  'lastContactAt',
  'createdAt',
] as const;
export const CompanySortFieldSchema = z.enum(COMPANY_SORT_FIELDS);
export type CompanySortField = z.infer<typeof CompanySortFieldSchema>;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const SortDirectionSchema = z.enum(SORT_DIRECTIONS);
export type SortDirection = z.infer<typeof SortDirectionSchema>;

/** Acepta `status=A`, `status=A&status=B` o `status=A,B` y lo entrega siempre como arreglo. */
const statusListFromQuery = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((v) => (typeof v === 'string' ? v.split(',') : [v])).filter((v) => v !== '');
};

const booleanFromQuery = (value: unknown): unknown => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value === '' ? undefined : value;
};

const optionalIntQuery = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int().min(1).optional(),
);

const optionalCountQuery = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int().min(0).optional(),
);

export const CompanySearchQuerySchema = PaginationQuerySchema.extend({
  /** Texto libre sobre RUC, razón social y nombre comercial. */
  q: z.string().trim().max(100).optional(),
  status: z.preprocess(statusListFromQuery, z.array(PipelineStatusSchema).min(1).optional()),
  sectorId: optionalIntQuery,
  activityId: optionalIntQuery,
  minEmployees: optionalCountQuery,
  maxEmployees: optionalCountQuery,
  hasPhone: z.preprocess(booleanFromQuery, z.boolean().optional()),
  sortBy: CompanySortFieldSchema.default('legalName'),
  sortDir: SortDirectionSchema.default('asc'),
}).refine(
  (q) =>
    q.minEmployees === undefined ||
    q.maxEmployees === undefined ||
    q.minEmployees <= q.maxEmployees,
  { message: 'minEmployees no puede ser mayor que maxEmployees', path: ['minEmployees'] },
);
export type CompanySearchQuery = z.infer<typeof CompanySearchQuerySchema>;

/** Texto opcional que acepta `null`/`''` como "sin valor". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

const employeeCountSchema = z.coerce.number().int().min(0).max(10_000_000);
const catalogIdSchema = z.number().int().min(1).nullish();

export const CreateCompanySchema = z.object({
  ruc: RucSchema,
  legalName: z.string().trim().min(1).max(200),
  tradeName: optionalText(200),
  legalRepName: optionalText(100),
  legalRepIdNumber: optionalText(20),
  employeeCount: employeeCountSchema.default(0),
  phone: optionalText(30),
  shippingAddress: optionalText(300),
  particularAddress: optionalText(300),
  activityId: catalogIdSchema,
  sectorId: catalogIdSchema,
});
export type CreateCompany = z.infer<typeof CreateCompanySchema>;

/** Edición parcial. El RUC y el estado del pipeline no se pueden cambiar por aquí. */
export const UpdateCompanySchema = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    tradeName: optionalText(200),
    legalRepName: optionalText(100),
    legalRepIdNumber: optionalText(20),
    employeeCount: employeeCountSchema,
    phone: optionalText(30),
    shippingAddress: optionalText(300),
    particularAddress: optionalText(300),
    activityId: catalogIdSchema,
    sectorId: catalogIdSchema,
  })
  .partial()
  .strict();
export type UpdateCompany = z.infer<typeof UpdateCompanySchema>;

export const CreateBranchSchema = z.object({
  tradeName: optionalText(200),
  address: optionalText(300),
  phone: optionalText(30),
  employeeCount: employeeCountSchema.default(0),
});
export type CreateBranch = z.infer<typeof CreateBranchSchema>;

export const CatalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

export interface CatalogItem {
  id: number;
  name: string;
}

/** Fila del listado: solo columnas ligeras, sin datos personales. Fechas en ISO 8601. */
export interface CompanyListItem {
  id: number;
  ruc: string;
  legalName: string;
  tradeName: string | null;
  employeeCount: number;
  phone: string | null;
  status: PipelineStatus;
  sectorId: number | null;
  sectorName: string | null;
  activityId: number | null;
  activityName: string | null;
  lastContactAt: string | null;
  createdAt: string;
}

export interface CompanyBranchDto {
  id: number;
  tradeName: string | null;
  address: string | null;
  phone: string | null;
  employeeCount: number;
  createdAt: string;
}

export interface CompanyDetail extends CompanyListItem {
  legalRepName: string | null;
  /** Dato personal: solo se incluye para ADMIN y SUPERVISOR. */
  legalRepIdNumber?: string | null;
  shippingAddress: string | null;
  particularAddress: string | null;
  source: 'EXCEL' | 'MANUAL';
  version: number;
  updatedAt: string;
  branches: CompanyBranchDto[];
}
