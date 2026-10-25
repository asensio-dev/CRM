/** Empresa del pool (sin asignación activa, en rotación y con teléfono). */
export interface PoolCandidate {
  companyId: number;
  employeeCount: number;
  sectorId: number | null;
  /** Ejecutivo de su asignación más reciente (null = nunca asignada). */
  previousOwnerId: number | null;
  /** Su última asignación se liberó por SIN_AVANCE (vuelve para que la trabaje otro). */
  recycled: boolean;
}

/** Cuántas empresas necesita cada ejecutivo para llegar a su tamaño de cartera. */
export interface PoolDemand {
  userId: number;
  count: number;
}

/** Patrón Strategy: reparte candidatos del pool entre los ejecutivos con hueco. */
export interface PoolSelectionStrategy {
  distribute(candidates: PoolCandidate[], demands: PoolDemand[]): Map<number, number[]>;
}

export const POOL_SELECTION_STRATEGY = Symbol('PoolSelectionStrategy');

/**
 * Por defecto (ADR 0006):
 *  - Orden de candidatos: recicladas (liberadas SIN_AVANCE) primero, luego más empleados, luego id.
 *  - Reparto round-robin (el que más hueco tiene elige primero) para que las mejores empresas
 *    no acaben todas en el mismo ejecutivo.
 *  - Nunca se devuelve una empresa a su ejecutivo anterior si hay otra disponible.
 */
export class DefaultPoolSelectionStrategy implements PoolSelectionStrategy {
  distribute(candidates: PoolCandidate[], demands: PoolDemand[]): Map<number, number[]> {
    const ranked = [...new Map(candidates.map((c) => [c.companyId, c])).values()].sort(
      (a, b) =>
        Number(b.recycled) - Number(a.recycled) ||
        b.employeeCount - a.employeeCount ||
        a.companyId - b.companyId,
    );
    const remaining = new Map(demands.filter((d) => d.count > 0).map((d) => [d.userId, d.count]));
    const result = new Map<number, number[]>([...remaining.keys()].map((id) => [id, []]));

    while (ranked.length > 0 && remaining.size > 0) {
      const turn = [...remaining.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      for (const [userId] of turn) {
        if (ranked.length === 0) break;
        let index = ranked.findIndex((c) => c.previousOwnerId !== userId);
        if (index < 0) index = 0; // solo quedan empresas suyas: mejor eso que dejar hueco
        const [picked] = ranked.splice(index, 1);
        if (picked) result.get(userId)?.push(picked.companyId);
        const left = (remaining.get(userId) ?? 0) - 1;
        if (left <= 0) remaining.delete(userId);
        else remaining.set(userId, left);
      }
    }
    return result;
  }
}
