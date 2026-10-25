import { z } from 'zod';
import type { InteractionOutcome, PipelineStatus } from './pipeline';

/**
 * API del módulo analytics (solo lectura). Todas las fechas/semanas se calculan en America/Managua.
 *
 *   GET /api/analytics/summary         AnalyticsFilter       → SummaryDto
 *   GET /api/analytics/funnel          AnalyticsFilter       → FunnelDto
 *   GET /api/analytics/weekly-activity WeeklyActivityQuery   → WeeklyActivityDto
 *   GET /api/analytics/executives      AnalyticsFilter       → ExecutivesDto
 *   GET /api/analytics/cycle-coverage  AnalyticsFilter       → CycleCoverageDto
 *
 * Un EJECUTIVO solo ve sus cifras (`userId` se fuerza a su propio id); SUPERVISOR/ADMIN ven todo
 * y pueden filtrar por `userId`.
 */

/** Día calendario `YYYY-MM-DD` (hora de Managua). `to` es inclusivo. */
const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD');
const IdSchema = z.coerce.number().int().positive();

export const AnalyticsFilterSchema = z
  .object({
    from: DaySchema.optional(),
    to: DaySchema.optional(),
    userId: IdSchema.optional(),
    sectorId: IdSchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` no puede ser posterior a `to`',
    path: ['from'],
  });
export type AnalyticsFilter = z.output<typeof AnalyticsFilterSchema>;

export const WeeklyActivityQuerySchema = z
  .object({
    from: DaySchema.optional(),
    to: DaySchema.optional(),
    userId: IdSchema.optional(),
    sectorId: IdSchema.optional(),
    weeks: z.coerce.number().int().min(1).max(52).default(12),
    /** `true` añade el desglose por ejecutivo en cada semana. */
    byExecutive: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` no puede ser posterior a `to`',
    path: ['from'],
  });
export type WeeklyActivityQuery = z.output<typeof WeeklyActivityQuerySchema>;

/** Porcentajes con un decimal (0–100+); `null` cuando el denominador es 0. */
export type Pct = number | null;

export interface WeekRangeDto {
  /** Lunes `YYYY-MM-DD` (Managua). */
  start: string;
  /** Domingo `YYYY-MM-DD` (Managua). */
  end: string;
}

export interface SummaryDto {
  generatedAt: string;
  week: WeekRangeDto;
  companies: { total: number; inPipeline: number };
  /** Pares (ejecutivo, empresa) distintos con ≥1 interacción en la semana. */
  contactsThisWeek: number;
  weeklyQuota: {
    activeExecutives: number;
    quotaPerExecutive: number;
    /** activeExecutives × quotaPerExecutive */
    target: number;
    /** contactsThisWeek ÷ target × 100 */
    compliancePct: Pct;
  };
  appointmentsThisWeek: number;
  contractsActive: {
    count: number;
    totalsByCurrency: { currency: string; count: number; totalAmount: number }[];
  };
  /** Empresas que llegaron a CONTRATO_ACTIVO ÷ empresas que llegaron a CONTACTADO (periodo). */
  conversion: { contacted: number; contracted: number; ratePct: Pct };
}

export interface FunnelStageDto {
  status: PipelineStatus;
  label: string;
  /** Empresas en este estado ahora mismo. */
  current: number;
  /** Empresas que alcanzaron el estado en el periodo (POR_CONTACTAR = total de empresas). */
  reached: number;
  /** reached ÷ reached de la etapa previa del camino principal; null en ramas laterales/primera etapa. */
  conversionPct: Pct;
}

export interface FunnelDto {
  period: { from: string | null; to: string | null };
  stages: FunnelStageDto[];
}

export interface WeeklyExecutiveActivityDto {
  userId: number;
  fullName: string;
  interactions: number;
  companiesContacted: number;
}

export interface WeeklyActivityPointDto {
  /** Lunes `YYYY-MM-DD` (Managua). */
  weekStart: string;
  interactions: number;
  companiesContacted: number;
  byOutcome: Record<InteractionOutcome, number>;
  executives?: WeeklyExecutiveActivityDto[];
}

export interface WeeklyActivityDto {
  weeks: WeeklyActivityPointDto[];
}

export interface CycleInfoDto {
  id: number;
  number: number;
  startDate: string;
  endDate: string;
  /** Semana actual dentro del ciclo (1..totalWeeks). */
  weekNumber: number;
  totalWeeks: number;
}

export interface ExecutiveStatsDto {
  userId: number;
  fullName: string;
  /** Empresas con asignación activa. */
  assigned: number;
  contactedThisWeek: number;
  weeklyQuota: number;
  quotaPct: Pct;
  contactedThisCycle: number;
  /** contactedThisCycle ÷ assigned × 100 */
  cycleCoveragePct: Pct;
  /** Cambios de estado hacia una etapa superior del camino principal, hechos por el ejecutivo. */
  statusAdvancesThisWeek: number;
  appointmentsThisWeek: number;
  contractsActive: number;
}

export interface ExecutivesDto {
  week: WeekRangeDto;
  cycle: CycleInfoDto | null;
  executives: ExecutiveStatsDto[];
}

export interface CycleCoverageExecutiveDto {
  userId: number;
  fullName: string;
  assigned: number;
  contacted: number;
  pending: number;
  coveragePct: Pct;
}

export interface CycleCoverageDto {
  cycle: CycleInfoDto | null;
  executives: CycleCoverageExecutiveDto[];
  totals: { assigned: number; contacted: number; pending: number; coveragePct: Pct };
}
