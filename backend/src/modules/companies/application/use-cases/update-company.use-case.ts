import type { UpdateCompany } from '@axiom/contracts';
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
  /** EJECUTIVO: solo empresas de su cartera activa; ADMIN/SUPERVISOR: todas (ADR 0006 §7). */
  actor: Actor;
}

/** Edita datos de la empresa. No cambia RUC ni estado del pipeline (eso es de `pipeline`). */
@Injectable()
export class UpdateCompanyUseCase implements UseCase<UpdateCompanyInput, void> {
  constructor(
    @Inject(COMPANY_READER) private readonly reader: CompanyReader,
    @Inject(COMPANY_WRITER) private readonly writer: CompanyWriter,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Optional()
    @Inject(COMPANY_ACCESS_POLICY)
    private readonly access: CompanyAccessPolicy = new AllowAllCompanyAccessPolicy(),
  ) {}

  async execute({ id, changes, actor }: UpdateCompanyInput): Promise<void> {
    await this.uow.run(async () => {
      const company = await this.writer.findById(id);
      if (!company) throw DomainError.notFound('COMPANY_NOT_FOUND', `Empresa ${id} no encontrada`);
      await assertCanOperate(this.access, actor, id);
      company.update(changes);
      await assertCatalogRefsExist(this.reader, company);
      await this.writer.save(company);
    });
  }
}
