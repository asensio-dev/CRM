import type { UserRole } from '@axiom/contracts';
import type { AnalyticsScope } from './queries/read-ports';

export interface AnalyticsActor {
  userId: number;
  role: UserRole;
}

/** EJECUTIVO: siempre solo sus cifras (ignora cualquier `userId` pedido). SUPERVISOR/ADMIN: lo pedido. */
export function resolveScope(
  actor: AnalyticsActor,
  filter: { userId?: number; sectorId?: number },
): AnalyticsScope {
  return {
    userId: actor.role === 'EJECUTIVO' ? actor.userId : filter.userId,
    sectorId: filter.sectorId,
  };
}
