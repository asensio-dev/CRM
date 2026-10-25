import type { UserRole } from '@axiom/contracts';
import { type Contract, contractForbidden } from '../domain';

export interface ContractActor {
  userId: number;
  role: UserRole;
}

export const isPrivileged = (actor: ContractActor): boolean =>
  actor.role === 'ADMIN' || actor.role === 'SUPERVISOR';

/** EJECUTIVO: solo los contratos que creó. SUPERVISOR / ADMIN: todos. */
export function assertCanManage(actor: ContractActor, contract: Contract): void {
  if (!isPrivileged(actor) && contract.createdById !== actor.userId) throw contractForbidden();
}
