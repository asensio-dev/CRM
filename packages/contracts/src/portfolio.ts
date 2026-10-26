import { z } from 'zod';
import type { PipelineStatus } from './pipeline';

export const PLAN_ITEM_REASONS = ['SEGUIMIENTO', 'NUEVA', 'REINTENTO', 'ROTACION'] as const;
export const PlanItemReasonSchema = z.enum(PLAN_ITEM_REASONS);
export type PlanItemReason = z.infer<typeof PlanItemReasonSchema>;

export const RELEASE_REASONS = [
  'SIN_AVANCE',
  'REASIGNACION_MANUAL',
  'CONTRATO_ACTIVO',
  'DESCARTADO',
] as const;
export const ReleaseReasonSchema = z.enum(RELEASE_REASONS);
export type ReleaseReason = z.infer<typeof ReleaseReasonSchema>;

/** Claves de la tabla `settings` y sus valores por defecto (los inserta el seed). */
export const SETTING_DEFAULTS = {
  ROTATION_CYCLE_WEEKS: { value: '3', description: 'Semanas por ciclo de rotación' },
  WEEKLY_CONTACT_QUOTA: {
    value: '20',
    description: 'Contactos mínimos por ejecutivo y semana',
  },
  MAX_CYCLES_WITHOUT_PROGRESS: {
    value: '2',
    description: 'Ciclos sin avance antes de devolver la empresa al pool',
  },
  TIMEZONE: { value: 'America/Managua', description: 'Zona horaria del negocio' },
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

// ───────────────────────────── API del módulo portfolio ─────────────────────────────
/**
 *   GET  /api/portfolio/my-week                 ?userId (solo ADMIN/SUPERVISOR) → MyWeekDto
 *   GET  /api/portfolio/cycles/current          → CurrentCycleDto
 *   GET  /api/portfolio/assignments             AssignmentsQuery → Paginated<AssignmentDto>
 *   POST /api/portfolio/assignments/reassign    ReassignRequest → AssignmentChangeResultDto   (ADMIN/SUPERVISOR)
 *   POST /api/portfolio/assignments/bulk        BulkAssignRequest → AssignmentChangeResultDto (ADMIN/SUPERVISOR)
 *   POST /api/portfolio/assignments/:id/release ReleaseAssignmentRequest → AssignmentChangeResultDto (ADMIN/SUPERVISOR)
 *   POST /api/portfolio/run-weekly              → RunWeeklyResultDto (ADMIN)
 *
 * Errores: 403 PORTFOLIO_FORBIDDEN, 404 PORTFOLIO_USER_NOT_FOUND / PORTFOLIO_ASSIGNMENT_NOT_FOUND,
 * 422 PORTFOLIO_NO_ACTIVE_CYCLE / PORTFOLIO_TARGET_NOT_EXECUTIVE / PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED.
 * El pipeline devuelve 403 PORTFOLIO_COMPANY_NOT_ASSIGNED si un EJECUTIVO opera una empresa fuera de su cartera.
 */

const PortfolioIdSchema = z.coerce.number().int().positive();

export const MyWeekQuerySchema = z.object({ userId: PortfolioIdSchema.optional() });
export type MyWeekQuery = z.output<typeof MyWeekQuerySchema>;

export interface CycleDto {
  id: number;
  number: number;
  /** Fechas locales (America/Managua) `YYYY-MM-DD`; endDate inclusive (domingo). */
  startDate: string;
  endDate: string;
  totalWeeks: number;
  closedAt: string | null;
}

export interface WeekInfoDto {
  cycle: CycleDto;
  /** Semana k de N dentro del ciclo. */
  weekNumber: number;
  totalWeeks: number;
  /** Lunes y domingo de la semana (fechas locales). */
  weekStart: string;
  weekEnd: string;
}

export interface MyWeekItemDto {
  itemId: number;
  companyId: number;
  legalName: string;
  tradeName: string | null;
  phone: string | null;
  status: PipelineStatus;
  reason: PlanItemReason;
  priority: number;
  contactedAt: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
}

export interface MyWeekDto {
  userId: number;
  /** null si todavía no hay ciclo abierto. */
  week: WeekInfoDto | null;
  /** null si aún no se generó el plan de esta semana para el usuario. */
  planId: number | null;
  generatedAt: string | null;
  quota: number;
  contactedCount: number;
  totalItems: number;
  items: MyWeekItemDto[];
}

export interface ExecutiveCoverageDto {
  userId: number;
  fullName: string;
  assigned: number;
  target: number;
  /** Empresas de su cartera con al menos una interacción dentro del ciclo. */
  contactedThisCycle: number;
  /** contactedThisCycle / assigned × 100 (0 si no tiene cartera). */
  coveragePct: number;
  plan: { planId: number; items: number; contacted: number; quota: number } | null;
}

export interface CurrentCycleDto {
  week: WeekInfoDto | null;
  executives: ExecutiveCoverageDto[];
}

export const AssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  userId: PortfolioIdSchema.optional(),
});
export type AssignmentsQuery = z.output<typeof AssignmentsQuerySchema>;

export interface AssignmentDto {
  id: number;
  companyId: number;
  legalName: string;
  tradeName: string | null;
  phone: string | null;
  status: PipelineStatus;
  employeeCount: number;
  lastContactAt: string | null;
  userId: number;
  userName: string;
  cycleId: number;
  assignedAt: string;
  cyclesWithoutProgress: number;
}

export const ReassignSchema = z.object({
  companyIds: z.array(PortfolioIdSchema).min(1).max(500),
  toUserId: PortfolioIdSchema,
});
export type ReassignRequest = z.input<typeof ReassignSchema>;
export type ReassignCommand = z.output<typeof ReassignSchema>;

export const BulkAssignSchema = z.object({
  filters: z
    .object({
      sectorId: PortfolioIdSchema.optional(),
      activityId: PortfolioIdSchema.optional(),
      minEmployees: z.coerce.number().int().min(0).optional(),
    })
    .default({}),
  toUserId: PortfolioIdSchema,
  limit: z.coerce.number().int().min(1).max(500),
});
export type BulkAssignRequest = z.input<typeof BulkAssignSchema>;
export type BulkAssignCommand = z.output<typeof BulkAssignSchema>;

export const ReleaseAssignmentSchema = z
  .object({ reason: ReleaseReasonSchema.optional() })
  .default({});
export type ReleaseAssignmentRequest = z.input<typeof ReleaseAssignmentSchema>;
export type ReleaseAssignmentCommand = z.output<typeof ReleaseAssignmentSchema>;

export interface AssignmentChangeResultDto {
  /** Empresas que quedaron asignadas al destino. */
  assigned: number[];
  /** Asignaciones previas liberadas (id de asignación). */
  released: number[];
  /** Empresas no tocadas (ya eran del destino, inexistentes o fuera de rotación). */
  skipped: number[];
}

export interface RunWeeklyResultDto {
  closedCycle: {
    number: number;
    evaluated: number;
    withProgress: number;
    withoutProgress: number;
    released: number;
  } | null;
  openedCycle: number | null;
  week: WeekInfoDto;
  refill: { executives: number; assigned: number; shortfall: number };
  plans: { generated: number; existing: number; items: number };
}
