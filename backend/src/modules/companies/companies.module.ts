import { Module } from '@nestjs/common';
import { AddCompanyBranchUseCase } from './application/use-cases/add-company-branch.use-case';
import { CreateCompanyUseCase } from './application/use-cases/create-company.use-case';
import { GetCompanyDetailUseCase } from './application/use-cases/get-company-detail.use-case';
import { SearchCompaniesUseCase } from './application/use-cases/search-companies.use-case';
import { UpdateCompanyUseCase } from './application/use-cases/update-company.use-case';
import { COMPANY_READER, COMPANY_WRITER } from './domain';
import { CompaniesController } from './infrastructure/http/companies.controller';
import { CatalogNameCache } from './infrastructure/persistence/catalog-name.cache';
import { PrismaCompanyReader } from './infrastructure/persistence/prisma-company.reader';
import { PrismaCompanyWriter } from './infrastructure/persistence/prisma-company.writer';

@Module({
  controllers: [CompaniesController],
  providers: [
    { provide: COMPANY_READER, useClass: PrismaCompanyReader },
    { provide: COMPANY_WRITER, useClass: PrismaCompanyWriter },
    CatalogNameCache,
    SearchCompaniesUseCase,
    GetCompanyDetailUseCase,
    CreateCompanyUseCase,
    UpdateCompanyUseCase,
    AddCompanyBranchUseCase,
  ],
})
export class CompaniesModule {}
