import {
  type BoardCardDto,
  type BoardDto,
  type BoardQuery,
  normalizeSearchText,
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

function boardFilters(query: BoardQuery): Prisma.Sql[] {
  const filters: Prisma.Sql[] = [];
  if (query.sectorId !== undefined) filters.push(Prisma.sql`c.[sectorId] = ${query.sectorId}`);
  if (query.activityId !== undefined) {
    filters.push(Prisma.sql`c.[activityId] = ${query.activityId}`);
  }
  if (query.q) {
    // Columna calculada normalizada con collation BIN2 + índice (migración search_and_board_indexes)
    const pattern = `%${escapeLike(normalizeSearchText(query.q))}%`;
    filters.push(Prisma.sql`c.[searchText] LIKE ${pattern} ESCAPE '!'`);
  }
  return filters;
}

const CARD_ORDER = Prisma.sql`c.[lastContactAt] ASC, c.[employeeCount] DESC, c.[id] ASC`;

/**
 * Tablero kanban en UNA consulta parametrizada (@P1…; nunca se concatena la entrada del usuario).
 * Orden de tarjetas: menos recientemente contactadas primero (NULL = nunca), luego más empleados.
 *
 * Dos planes según el filtro (medidos sobre ~80 k filas):
 *  - Sin texto: GROUP BY status (índice companies_status_idx) + CROSS APPLY TOP N por estado.
 *    ~3× más rápido que la ventana y con el índice (status, lastContactAt, employeeCount) son seeks.
 *  - Con texto (`q`): el LIKE '%…%' obliga a recorrer la tabla, así que se evalúa UNA vez con
 *    ROW_NUMBER()/COUNT(*) OVER (PARTITION BY status) en lugar de una vez por estado.
 */
export function buildBoardSql(query: BoardQuery): Prisma.Sql {
  const filters = boardFilters(query);
  if (!query.q) {
    const and =
      filters.length > 0 ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
    return Prisma.sql`
    SELECT x.[id], x.[legalName], x.[tradeName], x.[phone], x.[employeeCount], x.[lastContactAt],
           s.[status], s.[total]
    FROM (
      SELECT c.[status], COUNT(*) AS total FROM [dbo].[companies] c WHERE 1 = 1 ${and}
      GROUP BY c.[status]
    ) s
    CROSS APPLY (
      SELECT TOP (${query.limitPerColumn}) c.[id], c.[legalName], c.[tradeName], c.[phone],
             c.[employeeCount], c.[lastContactAt]
      FROM [dbo].[companies] c
      WHERE c.[status] = s.[status] ${and}
      ORDER BY ${CARD_ORDER}
    ) x
    ORDER BY s.[status]`;
  }

  const where = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
  return Prisma.sql`
    WITH ranked AS (
      SELECT c.[id], c.[legalName], c.[tradeName], c.[phone], c.[employeeCount],
             c.[lastContactAt], c.[status],
             ROW_NUMBER() OVER (PARTITION BY c.[status] ORDER BY ${CARD_ORDER}) AS rn,
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
