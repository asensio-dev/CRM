import {
  type BoardCardDto,
  type BoardDto,
  type BoardQuery,
  PIPELINE_STATUSES,
  type PipelineStatus,
} from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { PipelineBoardReader } from '../../application/queries/read-ports';

interface BoardRow {
  id: number;
  legalName: string;
  tradeName: string | null;
  phone: string | null;
  employeeCount: number;
  lastContactAt: Date | null;
  status: string;
  total: number | bigint;
}

/** Escapa comodines de LIKE (se usa `ESCAPE '!'`). */
export const escapeLike = (value: string) => value.replace(/[!%_[]/g, '!$&');

/**
 * Tablero kanban en UNA consulta: ROW_NUMBER() y COUNT(*) particionados por estado.
 * Todos los valores van como parámetros (@P1…), nunca concatenados.
 * Orden de tarjetas: menos recientemente contactadas primero (NULL = nunca), luego más empleados.
 */
export function buildBoardSql(query: BoardQuery): Prisma.Sql {
  const filters: Prisma.Sql[] = [];
  if (query.sectorId !== undefined) filters.push(Prisma.sql`c.[sectorId] = ${query.sectorId}`);
  if (query.activityId !== undefined) {
    filters.push(Prisma.sql`c.[activityId] = ${query.activityId}`);
  }
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    filters.push(
      Prisma.sql`(c.[legalName] LIKE ${pattern} ESCAPE '!' OR c.[tradeName] LIKE ${pattern} ESCAPE '!' OR c.[ruc] LIKE ${pattern} ESCAPE '!')`,
    );
  }
  const where =
    filters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;

  return Prisma.sql`
    WITH ranked AS (
      SELECT c.[id], c.[legalName], c.[tradeName], c.[phone], c.[employeeCount],
             c.[lastContactAt], c.[status],
             ROW_NUMBER() OVER (
               PARTITION BY c.[status]
               ORDER BY c.[lastContactAt] ASC, c.[employeeCount] DESC, c.[id] ASC
             ) AS rn,
             COUNT(*) OVER (PARTITION BY c.[status]) AS total
      FROM [dbo].[companies] c
      ${where}
    )
    SELECT [id], [legalName], [tradeName], [phone], [employeeCount], [lastContactAt], [status], [total]
    FROM ranked
    WHERE rn <= ${query.limitPerColumn}
    ORDER BY [status], rn`;
}

/** Agrupa las filas en columnas, en el orden de PIPELINE_STATUSES y con columnas vacías incluidas. */
export function toBoard(rows: BoardRow[]): BoardDto {
  const columns = new Map(
    PIPELINE_STATUSES.map((status) => [status, { status, count: 0, cards: [] as BoardCardDto[] }]),
  );
  for (const row of rows) {
    const column = columns.get(row.status as PipelineStatus);
    if (!column) continue;
    column.count = Number(row.total);
    column.cards.push({
      id: row.id,
      legalName: row.legalName,
      tradeName: row.tradeName,
      phone: row.phone,
      employeeCount: row.employeeCount,
      lastContactAt: row.lastContactAt ? new Date(row.lastContactAt).toISOString() : null,
    });
  }
  return { columns: [...columns.values()] };
}

@Injectable()
export class PrismaBoardReader implements PipelineBoardReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(query: BoardQuery): Promise<BoardDto> {
    const rows = await this.prisma.db.$queryRaw<BoardRow[]>(buildBoardSql(query));
    return toBoard(rows);
  }
}
