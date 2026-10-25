import { Module } from '@nestjs/common';
import { ImportCompaniesUseCase } from './application/use-cases/import-companies.use-case';
import {
  CreateImportJobUseCase,
  GetImportJobUseCase,
  ListImportRejectionsUseCase,
} from './application/use-cases/import-job-queries';
import {
  COMPANY_IMPORT_WRITER,
  IMPORT_JOB_REPOSITORY,
  SPREADSHEET_ROW_SOURCE,
} from './domain/ports';
import { ImportController } from './infrastructure/http/import.controller';
import { PrismaCompanyImportWriter } from './infrastructure/persistence/prisma-company-import-writer';
import { PrismaImportJobRepository } from './infrastructure/persistence/prisma-import-job.repository';
import { ExcelJsRowSource } from './infrastructure/spreadsheet/exceljs-row-source';

@Module({
  controllers: [ImportController],
  providers: [
    { provide: SPREADSHEET_ROW_SOURCE, useClass: ExcelJsRowSource },
    { provide: COMPANY_IMPORT_WRITER, useClass: PrismaCompanyImportWriter },
    { provide: IMPORT_JOB_REPOSITORY, useClass: PrismaImportJobRepository },
    ImportCompaniesUseCase,
    CreateImportJobUseCase,
    GetImportJobUseCase,
    ListImportRejectionsUseCase,
  ],
  exports: [ImportCompaniesUseCase, CreateImportJobUseCase],
})
export class ImportModule {}
