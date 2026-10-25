import type {
  ImportJobDto,
  ImportRejectionDto,
  Paginated,
  PaginationQuery,
} from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import {
  IMPORT_JOB_REPOSITORY,
  type ImportJobRecord,
  type ImportJobRepository,
} from '../../domain/ports';

export function toJobDto(job: ImportJobRecord): ImportJobDto {
  return {
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    totalRows: job.totalRows,
    insertedCount: job.insertedCount,
    updatedCount: job.updatedCount,
    branchCount: job.branchCount,
    rejectedCount: job.rejectedCount,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class CreateImportJobUseCase
  implements UseCase<{ fileName: string; createdById?: number | null }, ImportJobDto>
{
  constructor(@Inject(IMPORT_JOB_REPOSITORY) private readonly jobs: ImportJobRepository) {}

  async execute(input: { fileName: string; createdById?: number | null }): Promise<ImportJobDto> {
    return toJobDto(await this.jobs.create(input));
  }
}

@Injectable()
export class GetImportJobUseCase implements UseCase<number, ImportJobDto> {
  constructor(@Inject(IMPORT_JOB_REPOSITORY) private readonly jobs: ImportJobRepository) {}

  async execute(id: number): Promise<ImportJobDto> {
    const job = await this.jobs.findById(id);
    if (!job) throw DomainError.notFound('IMPORT_JOB_NOT_FOUND', 'Importación no encontrada');
    return toJobDto(job);
  }
}

@Injectable()
export class ListImportRejectionsUseCase
  implements UseCase<{ jobId: number; query: PaginationQuery }, Paginated<ImportRejectionDto>>
{
  constructor(@Inject(IMPORT_JOB_REPOSITORY) private readonly jobs: ImportJobRepository) {}

  async execute(input: {
    jobId: number;
    query: PaginationQuery;
  }): Promise<Paginated<ImportRejectionDto>> {
    if (!(await this.jobs.findById(input.jobId))) {
      throw DomainError.notFound('IMPORT_JOB_NOT_FOUND', 'Importación no encontrada');
    }
    const { page, pageSize } = input.query;
    const { items, total } = await this.jobs.listRejections(input.jobId, page, pageSize);
    return { items, page, pageSize, total };
  }
}
