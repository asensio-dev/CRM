import { DomainError } from '../../../../shared/domain';
import type { Actor } from '../../domain';

/**
 * Puerto: ¿puede `actor` cambiar el estado / registrar interacciones de la empresa?
 * El pipeline no sabe nada de carteras; el módulo `portfolio` aporta la implementación real
 * registrándola bajo `COMPANY_ACCESS_POLICY` en un módulo global (ver ADR 0005).
 * Si nadie la registra, los casos de uso usan `AllowAllCompanyAccessPolicy`.
 */
export interface CompanyAccessPolicy {
  canOperate(actor: Actor, companyId: number): Promise<boolean>;
}

export const COMPANY_ACCESS_POLICY = Symbol('CompanyAccessPolicy');

/** Política por defecto (sin módulo portfolio): no restringe. */
export class AllowAllCompanyAccessPolicy implements CompanyAccessPolicy {
  async canOperate(): Promise<boolean> {
    return true;
  }
}

export const companyNotAssigned = (companyId: number) =>
  new DomainError(
    'PORTFOLIO_COMPANY_NOT_ASSIGNED',
    `La empresa ${companyId} no está en tu cartera activa`,
    'FORBIDDEN',
  );

export async function assertCanOperate(
  policy: CompanyAccessPolicy,
  actor: Actor,
  companyId: number,
): Promise<void> {
  if (!(await policy.canOperate(actor, companyId))) throw companyNotAssigned(companyId);
}
