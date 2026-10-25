import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  CompanyPipeline,
  type CompanyPipelineRepository,
  concurrentUpdate,
  type PipelineStatusCode,
} from '../../domain';

/**
 * Este módulo es el ÚNICO que escribe `companies.status`, `companies.version`,
 * `companies.lastContactAt` y las tablas `interactions` y `status_history`.
 * Usa siempre `prisma.db` para participar en la transacción de `UnitOfWork.run`.
 */
@Injectable()
export class PrismaCompanyPipelineRepository implements CompanyPipelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(companyId: number): Promise<CompanyPipeline | null> {
    const row = await this.prisma.db.company.findUnique({
      where: { id: companyId },
      select: { id: true, status: true, version: true, lastContactAt: true },
    });
    if (!row) return null;
    return CompanyPipeline.restore({
      companyId: row.id,
      status: row.status as PipelineStatusCode,
      version: row.version,
      lastContactAt: row.lastContactAt,
    });
  }

  async save(pipeline: CompanyPipeline): Promise<void> {
    if (!pipeline.hasChanges) return;
    const db = this.prisma.db;
    const { history, interactions } = pipeline.pendingChanges();

    // Bloqueo optimista: la fila debe seguir en la versión leída. Se actualiza primero
    // para tomar el bloqueo de fila antes de insertar en las tablas hijas.
    const { count } = await db.company.updateMany({
      where: { id: pipeline.companyId, version: pipeline.version },
      data: {
        status: pipeline.status.value,
        lastContactAt: pipeline.lastContactAt,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw concurrentUpdate();

    if (interactions.length > 0) {
      await db.interaction.createMany({
        data: interactions.map(({ props }) => ({
          companyId: props.companyId,
          userId: props.userId,
          planItemId: props.planItemId,
          channel: props.channel,
          outcome: props.outcome,
          notes: props.notes,
          occurredAt: props.occurredAt,
          nextFollowUpAt: props.nextFollowUpAt,
        })),
      });
    }
    if (history.length > 0) {
      await db.statusHistory.createMany({
        data: history.map((h) => ({
          companyId: h.companyId,
          userId: h.userId,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          note: h.note,
          changedAt: h.changedAt,
        })),
      });
    }
    pipeline.markPersisted(pipeline.version + 1);
  }
}
