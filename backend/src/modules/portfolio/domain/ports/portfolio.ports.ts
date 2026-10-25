import type { UserRole } from '@axiom/contracts';
import type { InstantRange, LocalDate } from '../calendar/business-calendar';
import type { PortfolioAssignment } from '../entities/portfolio-assignment';
import type { RotationCycle } from '../entities/rotation-cycle';
import type { WeeklyPlan } from '../entities/weekly-plan';
import type { PortfolioSettings } from '../portfolio-settings';
import type { PoolCandidate } from '../services/pool-selection-strategy';
import type { PlanCandidate } from '../services/prioritization-strategy';
import type { CycleEvidence } from '../services/progress-policy';

/** Puertos pequeños (ISP). Los adaptadores Prisma viven en infrastructure/persistence. */

export interface PortfolioSettingsProvider {
  get(): Promise<PortfolioSettings>;
}

export interface CycleRepository {
  /** Ciclo con el número más alto (abierto o cerrado); null si nunca se abrió ninguno. */
  findLatest(): Promise<RotationCycle | null>;
  /** Inserta (id null → asigna id) o actualiza `closedAt`. */
  save(cycle: RotationCycle): Promise<void>;
}

export interface AssignmentRepository {
  findById(id: number): Promise<PortfolioAssignment | null>;
  findActive(filter?: { userId?: number }): Promise<PortfolioAssignment[]>;
  findActiveByCompanyIds(companyIds: number[]): Promise<PortfolioAssignment[]>;
  hasActive(userId: number, companyId: number): Promise<boolean>;
  /** Asignaciones activas por usuario. */
  countActiveByUser(): Promise<Map<number, number>>;
  /** Inserta las nuevas y actualiza las modificadas (solo las que tienen cambios). */
  saveAll(assignments: PortfolioAssignment[]): Promise<void>;
}

export interface WeeklyPlanRepository {
  /** userIds que ya tienen plan esa semana. */
  usersWithPlan(weekStart: LocalDate): Promise<Set<number>>;
  /** Crea el plan; si ya existía (carrera, índice único userId+weekStart) devuelve `created: false`. */
  create(plan: WeeklyPlan): Promise<{ created: boolean }>;
  /** Marca el ítem si pertenece a la empresa y aún no estaba marcado. Devuelve filas afectadas. */
  markItemContacted(itemId: number, companyId: number, at: Date): Promise<number>;
  /** Marca los ítems de la empresa en los planes de esa semana aún sin marcar. */
  markCompanyContactedInWeek(companyId: number, weekStart: LocalDate, at: Date): Promise<number>;
}

export interface PortfolioUser {
  id: number;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface ExecutiveDirectory {
  listActiveExecutives(): Promise<PortfolioUser[]>;
  findById(id: number): Promise<PortfolioUser | null>;
}

export interface PoolFilters {
  sectorId?: number;
  activityId?: number;
  minEmployees?: number;
}

export interface PoolReader {
  /**
   * Superconjunto de candidatos para el reparto: hasta `limit` recicladas (liberadas SIN_AVANCE)
   * más las `limit` de más empleados. La estrategia decide el orden final.
   */
  findCandidates(limit: number): Promise<PoolCandidate[]>;
  /** Candidatos del pool que cumplen los filtros, más empleados primero. */
  findByFilters(filters: PoolFilters, limit: number): Promise<PoolCandidate[]>;
}

export interface CompanyLookup {
  /** Estado de cada empresa existente (las que no existen no aparecen). */
  statuses(companyIds: number[]): Promise<Map<number, string>>;
}

export interface PlanCandidateReader {
  /** Empresas de la cartera activa del usuario con datos para priorizar. */
  forUser(
    userId: number,
    windows: { cycle: InstantRange; week: InstantRange },
  ): Promise<PlanCandidate[]>;
}

export interface CycleEvidenceReader {
  forCompanies(companyIds: number[], window: InstantRange): Promise<Map<number, CycleEvidence>>;
}

export const PORTFOLIO_SETTINGS = Symbol('PortfolioSettingsProvider');
export const CYCLE_REPOSITORY = Symbol('CycleRepository');
export const ASSIGNMENT_REPOSITORY = Symbol('AssignmentRepository');
export const WEEKLY_PLAN_REPOSITORY = Symbol('WeeklyPlanRepository');
export const EXECUTIVE_DIRECTORY = Symbol('ExecutiveDirectory');
export const POOL_READER = Symbol('PoolReader');
export const COMPANY_LOOKUP = Symbol('CompanyLookup');
export const PLAN_CANDIDATE_READER = Symbol('PlanCandidateReader');
export const CYCLE_EVIDENCE_READER = Symbol('CycleEvidenceReader');
