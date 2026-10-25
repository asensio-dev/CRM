import type { CreateBranch } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork, type UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import { COMPANY_WRITER, type CompanyWriter } from '../../domain';

export interface AddCompanyBranchInput {
  companyId: number;
  branch: CreateBranch;
}

@Injectable()
export class AddCompanyBranchUseCase implements UseCase<AddCompanyBranchInput, void> {
  constructor(
    @Inject(COMPANY_WRITER) private readonly writer: CompanyWriter,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute({ companyId, branch }: AddCompanyBranchInput): Promise<void> {
    await this.uow.run(async () => {
      const company = await this.writer.findById(companyId);
      if (!company) {
        throw DomainError.notFound('COMPANY_NOT_FOUND', `Empresa ${companyId} no encontrada`);
      }
      company.addBranch(branch);
      await this.writer.save(company);
    });
  }
}
