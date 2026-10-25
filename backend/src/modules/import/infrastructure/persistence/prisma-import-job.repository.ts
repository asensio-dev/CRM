import type { ImportJobStatus } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type {
  ImportCounters,
  ImportJobRecord,
  ImportJobRepository,
  ImportRejectionRecord,
  NewRejection,
} from '../../domain/ports';

/** 4 columnas por rechazo × 400 = 1 600 parámetros < 2 100. */
const REJECTION_CHUNK = 400;

type JobRow = Omit<ImportJobRecord, 'status'> & { status: string };

const toRecord = (row: JobRow): ImportJobRecord => ({
  ...row,
  status: row.status as ImportJobStatus,
});

@Injectable()
export class PrismaImportJobRepository implements ImportJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { fileName: string; createdById?: number | null }) {
    const row = await this.prisma.db.importJob.create({
      data: { fileName: input.fileName.slice(0, 260), createdById: input.createdById ?? null },
    });
    return toRecord(row);
  }

  async findById(id: number) {
    const row = await this.prisma.db.importJob.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async markProcessing(id: number) {
    await this.prisma.db.importJob.update({
      where: { id },
      data: { status: 'PROCESANDO', startedAt: new Date() },
    });
  }

  async updateProgress(id: number, counters: ImportCounters) {
    await this.prisma.db.importJob.update({ where: { id }, data: { ...counters } });
  }

  async complete(id: number, counters: ImportCounters) {
    await this.prisma.db.importJob.update({
      where: { id },
      data: { ...counters, status: 'COMPLETADO', finishedAt: new Date() },
    });
  }

  async fail(id: number, counters: ImportCounters, message: string) {
    await this.prisma.db.importJob.update({
      where: { id },
      data: { ...counters, status: 'FALLIDO', errorMessage: message, finishedAt: new Date() },
    });
  }

  async addRejections(jobId: number, rejections: NewRejection[]) {
    for (let i = 0; i < rejections.length; i += REJECTION_CHUNK) {
      await this.prisma.db.importRejection.createMany({
        data: rejections.slice(i, i + REJECTION_CHUNK).map((r) => ({
          jobId,
          rowNumber: r.rowNumber,
          reason: r.reason.slice(0, 300),
          rawData: r.rawData,
        })),
      });
    }
  }

  async listRejections(jobId: number, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.prisma.db.importRejection.findMany({
        where: { jobId },
        orderBy: { rowNumber: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, rowNumber: true, reason: true },
      }),
      this.prisma.db.importRejection.count({ where: { jobId } }),
    ]);
    return { items: items as ImportRejectionRecord[], total };
  }
}
