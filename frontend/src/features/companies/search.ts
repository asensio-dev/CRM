import {
  COMPANY_SORT_FIELDS,
  type CompanySearchQuery,
  PIPELINE_STATUSES,
  type PipelineStatus,
} from '@axiom/contracts';
import { z } from 'zod';

export const COMPANIES_PAGE_SIZE = 25;
/** Tamaños de página que se ofrecen en el listado (el API admite hasta 100). */
export const COMPANIES_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const intOrUndef = (min: number) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().min(min).optional().catch(undefined),
  );

/**
 * Estado del listado que vive en la URL (`/empresas?q=...&status=...&page=2`).
 * Cada campo es tolerante: un valor inválido en un enlace compartido se ignora en vez de romper la página.
 */
export const CompaniesSearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.split(',') : v),
      z.array(z.enum(PIPELINE_STATUSES)).optional(),
    )
    .catch(undefined),
  sectorId: intOrUndef(1),
  activityId: intOrUndef(1),
  /** Solo para mostrar el nombre de la actividad elegida sin pedirla otra vez al API. */
  activityName: z.string().max(200).optional().catch(undefined),
  minEmployees: intOrUndef(0),
  maxEmployees: intOrUndef(0),
  hasPhone: z.boolean().optional().catch(undefined),
  page: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().min(1).catch(1).default(1),
  ),
  pageSize: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce
      .number()
      .int()
      .refine((n) => (COMPANIES_PAGE_SIZE_OPTIONS as readonly number[]).includes(n))
      .catch(COMPANIES_PAGE_SIZE)
      .default(COMPANIES_PAGE_SIZE),
  ),
  sortBy: z.enum(COMPANY_SORT_FIELDS).catch('legalName').default('legalName'),
  sortDir: z.enum(['asc', 'desc']).catch('asc').default('asc'),
});
export type CompaniesSearch = z.infer<typeof CompaniesSearchSchema>;

/** Valida el `search` crudo del router (con defaults aplicados). */
export function parseCompaniesSearch(raw: unknown): CompaniesSearch {
  return CompaniesSearchSchema.parse(raw ?? {});
}

/** Quita los valores por defecto/vacíos para mantener la URL corta y estable. */
export function toUrlSearch(search: CompaniesSearch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (search.q) out.q = search.q;
  if (search.status?.length) out.status = search.status;
  if (search.sectorId !== undefined) out.sectorId = search.sectorId;
  if (search.activityId !== undefined) {
    out.activityId = search.activityId;
    if (search.activityName) out.activityName = search.activityName;
  }
  if (search.minEmployees !== undefined) out.minEmployees = search.minEmployees;
  if (search.maxEmployees !== undefined) out.maxEmployees = search.maxEmployees;
  if (search.hasPhone) out.hasPhone = true;
  if (search.page > 1) out.page = search.page;
  if (search.pageSize !== COMPANIES_PAGE_SIZE) out.pageSize = search.pageSize;
  if (search.sortBy !== 'legalName') out.sortBy = search.sortBy;
  if (search.sortDir !== 'asc') out.sortDir = search.sortDir;
  return out;
}

export type CompaniesFilters = Pick<
  CompaniesSearch,
  | 'q'
  | 'status'
  | 'sectorId'
  | 'activityId'
  | 'activityName'
  | 'minEmployees'
  | 'maxEmployees'
  | 'hasPhone'
>;

/** Cuántos filtros (sin contar el orden ni la página) están activos. */
export function countActiveFilters(s: CompaniesSearch): number {
  return [
    !!s.q,
    !!s.status?.length,
    s.sectorId !== undefined,
    s.activityId !== undefined,
    s.minEmployees !== undefined || s.maxEmployees !== undefined,
    !!s.hasPhone,
  ].filter(Boolean).length;
}

/** Query string para `GET /api/companies`. */
export function toApiQueryString(search: CompaniesSearch): string {
  const p = new URLSearchParams();
  const query: Partial<CompanySearchQuery> = {
    q: search.q,
    sectorId: search.sectorId,
    activityId: search.activityId,
    minEmployees: search.minEmployees,
    maxEmployees: search.maxEmployees,
    hasPhone: search.hasPhone || undefined,
  };
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') p.set(k, String(v));
  for (const s of search.status ?? []) p.append('status', s satisfies PipelineStatus);
  p.set('page', String(search.page));
  p.set('pageSize', String(search.pageSize));
  p.set('sortBy', search.sortBy);
  p.set('sortDir', search.sortDir);
  return p.toString();
}
