import type { PlanItemReason } from '@axiom/contracts';

/** Una empresa de la cartera activa del ejecutivo, con lo necesario para priorizarla. */
export interface PlanCandidate {
  companyId: number;
  status: string;
  employeeCount: number;
  lastContactAt: Date | null;
  /** Compromiso más próximo dentro de la semana (seguimiento pactado o cita); null si no hay. */
  followUpAt: Date | null;
  /** ¿Tuvo alguna interacción dentro del ciclo actual? (indicador de cobertura) */
  contactedThisCycle: boolean;
}

export interface PlannedItem {
  companyId: number;
  reason: PlanItemReason;
  /** 1 = más prioritario. */
  priority: number;
}

export interface PrioritizationContext {
  /** Mínimo de contactos de la semana (WEEKLY_CONTACT_QUOTA). */
  quota: number;
  /** Semana k (1..totalWeeks) del ciclo. */
  weekNumber: number;
  totalWeeks: number;
}

/** Patrón Strategy: decide qué empresas entran al plan semanal y en qué orden. */
export interface PortfolioPrioritizationStrategy {
  prioritize(candidates: PlanCandidate[], context: PrioritizationContext): PlannedItem[];
}

export const PORTFOLIO_PRIORITIZATION_STRATEGY = Symbol('PortfolioPrioritizationStrategy');

const OUT_OF_ROTATION = new Set(['CONTRATO_ACTIVO', 'DESCARTADO']);
const REASON_RANK: Record<Exclude<PlanItemReason, 'SEGUIMIENTO'>, number> = {
  NUEVA: 0,
  REINTENTO: 1,
  ROTACION: 2,
};

const time = (d: Date | null): number => (d ? d.getTime() : Number.NEGATIVE_INFINITY);

function classify(c: PlanCandidate): Exclude<PlanItemReason, 'SEGUIMIENTO'> {
  if (c.status === 'POR_CONTACTAR' && c.lastContactAt === null) return 'NUEVA';
  if (c.status === 'SIN_RESPUESTA') return 'REINTENTO';
  return 'ROTACION';
}

/**
 * Orden por defecto (ADR 0006):
 *  1. SEGUIMIENTO: compromisos de la semana (por fecha), siempre entran aunque superen la cuota.
 *  2. Resto, primero las NO contactadas en el ciclo (cobertura) y dentro de cada grupo:
 *     NUEVA (POR_CONTACTAR nunca gestionada; más empleados primero) →
 *     REINTENTO (SIN_RESPUESTA; último intento más antiguo primero) →
 *     ROTACION (último contacto más antiguo primero, luego más empleados).
 *  Tamaño = max(cuota, seguimientos, ⌈pendientes de cubrir / semanas restantes⌉), acotado a la cartera:
 *  así en la semana N todas las empresas aún no contactadas en el ciclo están en el plan.
 */
export class DefaultPrioritizationStrategy implements PortfolioPrioritizationStrategy {
  prioritize(candidates: PlanCandidate[], context: PrioritizationContext): PlannedItem[] {
    const eligible = candidates.filter((c) => !OUT_OF_ROTATION.has(c.status));

    const followUps = eligible
      .filter((c) => c.followUpAt !== null)
      .sort(
        (a, b) =>
          time(a.followUpAt) - time(b.followUpAt) ||
          b.employeeCount - a.employeeCount ||
          a.companyId - b.companyId,
      );

    const rest = eligible
      .filter((c) => c.followUpAt === null)
      .map((c) => ({ c, reason: classify(c) }))
      .sort((x, y) => {
        const a = x.c;
        const b = y.c;
        return (
          Number(a.contactedThisCycle) - Number(b.contactedThisCycle) ||
          REASON_RANK[x.reason] - REASON_RANK[y.reason] ||
          (x.reason === 'NUEVA' ? 0 : time(a.lastContactAt) - time(b.lastContactAt)) ||
          b.employeeCount - a.employeeCount ||
          a.companyId - b.companyId
        );
      });

    const pending = eligible.filter((c) => !c.contactedThisCycle).length;
    const remainingWeeks = Math.max(1, context.totalWeeks - context.weekNumber + 1);
    const size = Math.min(
      eligible.length,
      Math.max(context.quota, followUps.length, Math.ceil(pending / remainingWeeks)),
    );

    const items: Omit<PlannedItem, 'priority'>[] = [
      ...followUps.map((c) => ({ companyId: c.companyId, reason: 'SEGUIMIENTO' as const })),
      ...rest
        .slice(0, Math.max(0, size - followUps.length))
        .map(({ c, reason }) => ({ companyId: c.companyId, reason })),
    ];
    return items.map((item, i) => ({ ...item, priority: i + 1 }));
  }
}
