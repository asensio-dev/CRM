import type { CreateCompany } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork, type UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import {
  COMPANY_READER,
  COMPANY_WRITER,
  Company,
  type CompanyReader,
  type CompanyWriter,
} from '../../domain';
import { assertCatalogRefsExist } from './catalog-refs';

export interface CreateCompanyInput {
  data: CreateCompany;
  /** Usuario que da el alta (auditoría); null si no hay sesión. */
  createdById?: number | null;
}

/** Alta manual: nace `POR_CONTACTAR` con `source = 'MANUAL'`. */
@Injectable()
export class CreateCompanyUseCase implements UseCase<CreateCompanyInput, { id: number }> {
  constructor(
    @Inject(COMPANY_READER) private readonly reader: CompanyReader,
    @Inject(COMPANY_WRITER) private readonly writer: CompanyWriter,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute({ data, createdById }: CreateCompanyInput): Promise<{ id: number }> {
    const company = Company.create({ ...data, createdById });
    await assertCatalogRefsExist(this.reader, company);

    return this.uow.run(async () => {
      if (await this.reader.existsByRuc(company.ruc.value)) {
        throw DomainError.conflict(
          'COMPANY_RUC_DUPLICATED',
          `Ya existe una empresa con el RUC ${company.ruc.value}`,
        );
      }
      await this.writer.insert(company);
      return { id: company.id as number };
    });
  }
}
