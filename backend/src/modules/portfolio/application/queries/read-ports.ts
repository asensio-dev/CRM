import type { AssignmentDto, AssignmentsQuery, MyWeekItemDto, Paginated } from '@axiom/contracts';
import type { InstantRange, LocalDate } from '../../domain';

/** Lecturas optimizadas (CQRS ligero): devuelven DTOs directamente, sin pasar por el dominio. */
export interface PlanView {
  plan: { id: number; quota: number; generatedAt: Date } | null;
  items: MyWeekItemDto[];
}

export interface CoverageRow {
  userId: number;
  assigned: number;
  contactedThisCycle: number;
  plan: { planId: number; items: number; contacted: number; quota: number } | null;
}

export interface PortfolioReadModel {
  /** Plan del usuario para la semana con los datos de cada empresa, por prioridad. */
  weekPlan(userId: number, weekStart: LocalDate): Promise<PlanView>;
  /** Cobertura por usuario con cartera activa (contactos dentro de `cycleWindow`). */
  coverage(cycleWindow: InstantRange, weekStart: LocalDate): Promise<CoverageRow[]>;
  assignments(query: AssignmentsQuery): Promise<Paginated<AssignmentDto>>;
}

export const PORTFOLIO_READ_MODEL = Symbol('PortfolioReadModel');
