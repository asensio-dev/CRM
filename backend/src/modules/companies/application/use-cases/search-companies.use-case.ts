import type { CompanyListItem, CompanySearchQuery, Paginated } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { buildCompanySpecification, COMPANY_READER, type CompanyReader } from '../../domain';

@Injectable()
export class SearchCompaniesUseCase
  implements UseCase<CompanySearchQuery, Paginated<CompanyListItem>>
{
  constructor(@Inject(COMPANY_READER) private readonly reader: CompanyReader) {}

  execute(query: CompanySearchQuery): Promise<Paginated<CompanyListItem>> {
    return this.reader.search({
      spec: buildCompanySpecification(query),
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
  }
}
