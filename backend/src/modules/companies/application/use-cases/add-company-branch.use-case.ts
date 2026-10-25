import type { CreateBranch } from '@axiom/contracts';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork, type UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import {
  type Actor,
  AllowAllCompanyAccessPolicy,
  assertCanOperate,
  COMPANY_ACCESS_POLICY,
  type CompanyAccessPolicy,
} from '../../../pipeline';
import { COMPANY_WRITER, type CompanyWriter } from '../../domain';

export interface AddCompanyBranchInput {
  companyId: number;
  branch: CreateBranch;
  /** EJECUTIVO: solo empresas de su cartera activa; ADMIN/SUPERVISOR: todas (ADR 0006 §7). */
  actor: Actor;
}

@Injectable()
export class AddCompanyBranchUseCase implements UseCase<AddCompanyBranchInput, void> {
  constructor(
    @Inject(COMPANY_WRITER) private readonly writer: CompanyWriter,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Optional()
    @Inject(COMPANY_ACCESS_POLICY)
    private readonly access: CompanyAccessPolicy = new AllowAllCompanyAccessPolicy(),
  ) {}

  async execute({ companyId, branch, actor }: AddCompanyBranchInput): Promise<void> {
    await this.uow.run(async () => {
      const company = await this.writer.findById(companyId);
      if (!company) {
        throw DomainError.notFound('COMPANY_NOT_FOUND', `Empresa ${companyId} no encontrada`);
      }
      await assertCanOperate(this.access, actor, companyId);
      company.addBranch(branch);
      await this.writer.save(company);
    });
  }
}
