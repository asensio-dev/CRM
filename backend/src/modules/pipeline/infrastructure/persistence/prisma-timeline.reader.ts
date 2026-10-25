import type {
  InteractionChannel,
  InteractionOutcome,
  Paginated,
  PipelineStatus,
  TimelineEntryDto,
} from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { PipelineTimelineReader } from '../../application/queries/read-ports';

/** Más reciente primero; a igual fecha, los cambios de estado antes que la interacción que los causó. */
export function compareTimeline(a: TimelineEntryDto, b: TimelineEntryDto): number {
  const byDate = b.occurredAt.localeCompare(a.occurredAt);
  if (byDate !== 0) return byDate;
  if (a.type !== b.type) return a.type === 'STATUS_CHANGE' ? -1 : 1;
  return b.id - a.id;
}

/**
 * Las dos tablas se leen ordenadas por sus índices (companyId, fecha). Para la página `p`
 * basta con las primeras p·pageSize filas de cada una: se mezclan en memoria y se corta.
 * El volumen por empresa es pequeño, así que no compensa un UNION ALL en SQL crudo.
 */
@Injectable()
export class PrismaTimelineReader implements PipelineTimelineReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    companyId: number,
    page: number,
    pageSize: number,
  ): Promise<Paginated<TimelineEntryDto>> {
    const db = this.prisma.db;
    const take = page * pageSize;
    const user = { select: { id: true, fullName: true } } as const;

    const [interactionCount, changeCount] = await Promise.all([
      db.interaction.count({ where: { companyId } }),
      db.statusHistory.count({ where: { companyId } }),
    ]);
    const total = interactionCount + changeCount;
    if ((page - 1) * pageSize >= total) return { items: [], page, pageSize, total };

    const [interactions, changes] = await Promise.all([
      db.interaction.findMany({
        where: { companyId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take,
        include: { user },
      }),
      db.statusHistory.findMany({
        where: { companyId },
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
        take,
        include: { user },
      }),
    ]);

    const entries: TimelineEntryDto[] = [
      ...interactions.map(
        (i): TimelineEntryDto => ({
          type: 'INTERACTION',
          id: i.id,
          occurredAt: i.occurredAt.toISOString(),
          user: i.user,
          channel: i.channel as InteractionChannel,
          outcome: i.outcome as InteractionOutcome,
          notes: i.notes,
          nextFollowUpAt: i.nextFollowUpAt?.toISOString() ?? null,
          planItemId: i.planItemId,
        }),
      ),
      ...changes.map(
        (h): TimelineEntryDto => ({
          type: 'STATUS_CHANGE',
          id: h.id,
          occurredAt: h.changedAt.toISOString(),
          user: h.user,
          fromStatus: h.fromStatus as PipelineStatus | null,
          toStatus: h.toStatus as PipelineStatus,
          note: h.note,
        }),
      ),
    ].sort(compareTimeline);

    return {
      items: entries.slice((page - 1) * pageSize, take),
      page,
      pageSize,
      total,
    };
  }
}
