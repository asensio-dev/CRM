import { Inject, Injectable } from '@nestjs/common';
import type { Actor, CompanyAccessPolicy } from '../../../pipeline';
import { ASSIGNMENT_REPOSITORY, type AssignmentRepository } from '../../domain';
import { isSupervisorRole } from './rotation-context';

/**
 * Implementación real del puerto `CompanyAccessPolicy` del pipeline:
 * ADMIN y SUPERVISOR operan cualquier empresa; un EJECUTIVO solo las de su cartera ACTIVA.
 */
@Injectable()
export class PortfolioCompanyAccessPolicy implements CompanyAccessPolicy {
  constructor(@Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository) {}

  async canOperate(actor: Actor, companyId: number): Promise<boolean> {
    if (isSupervisorRole(actor.role)) return true;
    if (actor.role !== 'EJECUTIVO') return false;
    return this.assignments.hasActive(actor.userId, companyId);
  }
}
