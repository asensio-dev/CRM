import type { UpdateCompany } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork, type UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import {
  COMPANY_READER,
  COMPANY_WRITER,
  type CompanyReader,
  type CompanyWriter,
} from '../../domain';
import { assertCatalogRefsExist } from './catalog-refs';

export interface UpdateCompanyInput {
  id: number;
  changes: UpdateCompany;
}

/** Edita datos de la empresa. No cambia RUC ni estado del pipeline (eso es de `pipeline`). */
@Injectable()
export class UpdateCompanyUseCase implements UseCase<UpdateCompanyInput, void> {
  constructor(
    @Inject(COMPANY_READER) private readonly reader: CompanyReader,
    @Inject(COMPANY_WRITER) private readonly writer: CompanyWriter,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute({ id, changes }: UpdateCompanyInput): Promise<void> {
    await this.uow.run(async () => {
      const company = await this.writer.findById(id);
      if (!company) throw DomainError.notFound('COMPANY_NOT_FOUND', `Empresa ${id} no encontrada`);

      company.update(changes);
      await assertCatalogRefsExist(this.reader, company);
      await this.writer.save(company);
    });
  }
}
