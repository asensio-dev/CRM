import type { CompanyDetail } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import { COMPANY_READER, type CompanyReader } from '../../domain';

export interface GetCompanyDetailInput {
  id: number;
  /** ADMIN / SUPERVISOR. Si es false se omite la cédula del representante (dato personal). */
  canViewSensitive: boolean;
}

@Injectable()
export class GetCompanyDetailUseCase implements UseCase<GetCompanyDetailInput, CompanyDetail> {
  constructor(@Inject(COMPANY_READER) private readonly reader: CompanyReader) {}

  async execute({ id, canViewSensitive }: GetCompanyDetailInput): Promise<CompanyDetail> {
    const detail = await this.reader.getDetail(id);
    if (!detail) throw DomainError.notFound('COMPANY_NOT_FOUND', `Empresa ${id} no encontrada`);
    if (canViewSensitive) return detail;
    const { legalRepIdNumber: _omitted, ...safe } = detail;
    return safe;
  }
}
