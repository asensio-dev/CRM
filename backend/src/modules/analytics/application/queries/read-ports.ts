import type { InteractionOutcome, PipelineStatus } from '@axiom/contracts';
import type { UtcRange } from '../time/managua-time';

/** Filtros ya resueltos (el rol ya se aplicó): `userId` indefinido = todos. */
export interface AnalyticsScope {
  userId?: number;
  sectorId?: number;
}

export interface AnalyticsSettings {
  weeklyQuota: number;
}

export interface ExecutiveRef {
  id: number;
  fullName: string;
}

export interface CycleRow {
  id: number;
  number: number;
  /** `YYYY-MM-DD` */
  startDay: string;
  /** `YYYY-MM-DD` (inclusivo) */
  endDay: string;
}

export interface CurrencyTotal {
  currency: string;
  count: number;
  totalAmount: number;
}

export type StatusCounts = Partial<Record<PipelineStatus, number>>;

export interface WeeklyActivityRows {
  /** Índice de semana desde `anchorDay` (0 = primera). */
  outcomes: { week: number; outcome: InteractionOutcome; count: number }[];
  companies: { week: number; count: number }[];
  executives: {
    week: number;
    userId: number;
    fullName: string;
    interactions: number;
    companies: number;
  }[];
}

/** Conteos por ejecutivo (clave = userId); los que no aparecen valen 0. */
export interface ExecutiveMetricRows {
  assigned: Map<number, number>;
  contactedWeek: Map<number, number>;
  contactedCycle: Map<number, number>;
  advancesWeek: Map<number, number>;
  appointmentsWeek: Map<number, number>;
  contractsActive: Map<number, number>;
}

/** Puerto de lectura de analytics (CQRS-lite): SQL agregado, sin entidades de dominio. */
export interface AnalyticsReader {
  settings(): Promise<AnalyticsSettings>;
  /** Ciclo vigente (el que contiene `today` o el último abierto), o null. */
  currentCycle(today: string): Promise<CycleRow | null>;
  /** Ejecutivos activos (rol EJECUTIVO), opcionalmente solo `userId`. */
  activeExecutives(scope: AnalyticsScope): Promise<ExecutiveRef[]>;
  companiesByStatus(scope: AnalyticsScope): Promise<StatusCounts>;
  /** Empresas distintas que alcanzaron cada estado según status_history en el periodo. */
  reachedByStatus(scope: AnalyticsScope, period: UtcRange): Promise<StatusCounts>;
  /** Pares (ejecutivo activo, empresa) distintos con interacción en el rango. */
  contactPairs(scope: AnalyticsScope, range: UtcRange): Promise<number>;
  appointments(scope: AnalyticsScope, range: UtcRange): Promise<number>;
  activeContracts(scope: AnalyticsScope): Promise<CurrencyTotal[]>;
  weeklyActivity(
    scope: AnalyticsScope,
    range: UtcRange,
    anchorDay: string,
    byExecutive: boolean,
  ): Promise<WeeklyActivityRows>;
  executiveMetrics(
    scope: AnalyticsScope,
    week: UtcRange,
    cycle: UtcRange | null,
  ): Promise<ExecutiveMetricRows>;
}

export const ANALYTICS_READER = Symbol('AnalyticsReader');
