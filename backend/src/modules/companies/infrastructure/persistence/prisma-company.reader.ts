import type {
  CompanyDetail,
  CompanyListItem,
  CompanySortField,
  Paginated,
  PipelineStatus,
  SortDirection,
} from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { CompanyReader, CompanySearchCriteria } from '../../domain';
import { CatalogNameCache, type CatalogNames } from './catalog-name.cache';
import { hasTextFilter, toPrismaCompanyWhere, toSqlCompanyWhere } from './prisma-company-where';

/** Columnas de orden permitidas (lista cerrada: nunca se interpola texto del usuario). */
const SORT_COLUMNS: Record<CompanySortField, string> = {
  legalName: 'legalName',
  employeeCount: 'employeeCount',
  lastContactAt: 'lastContactAt',
  createdAt: 'createdAt',
};

/** Solo las columnas del listado (sin cédula ni direcciones): rápido sobre 127 k filas. */
const LIST_SELECT = {
  id: true,
  ruc: true,
  legalName: true,
  tradeName: true,
  employeeCount: true,
  phone: true,
  status: true,
  sectorId: true,
  activityId: true,
  lastContactAt: true,
  createdAt: true,
  // Nombres de sector/actividad: CatalogNameCache (antes, dos consultas extra por página)
} satisfies Prisma.CompanySelect;

type ListRow = Prisma.CompanyGetPayload<{ select: typeof LIST_SELECT }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toListItem(row: ListRow, names: CatalogNames): CompanyListItem {
  return {
    id: row.id,
    ruc: row.ruc,
    legalName: row.legalName,
    tradeName: row.tradeName,
    employeeCount: row.employeeCount,
    phone: row.phone,
    status: row.status as PipelineStatus,
    sectorId: row.sectorId,
    sectorName: names.sector(row.sectorId),
    activityId: row.activityId,
    activityName: names.activity(row.activityId),
    lastContactAt: iso(row.lastContactAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function orderBy(
  sortBy: CompanySortField,
  sortDir: SortDirection,
): Prisma.CompanyOrderByWithRelationInput[] {
  // `id` como desempate: la paginación por offset necesita un orden total estable. Va en la MISMA
  // dirección que el campo para que un índice (campo, id) sirva en los dos sentidos (recorrido hacia
  // atrás); con `id ASC` fijo, cada orden descendente obligaba a ordenar todas las coincidencias.
  return [{ [sortBy]: sortDir }, { id: sortDir }];
}

@Injectable()
export class PrismaCompanyReader implements CompanyReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogNames: CatalogNameCache,
  ) {}

  /**
   * Paginación en dos pasos ("deferred join", ver docs/rendimiento-qa.md): primero solo los `id` de
   * la página (los resuelve un índice estrecho: legalName, searchText INCLUDE…, status…), después
   * las columnas del listado por clave primaria. Pedir todas las columnas con OFFSET obligaba a
   * SQL Server a ordenar la tabla completa (~400 ms de CPU en paralelo por página sobre 103 k filas).
   */
  async search(criteria: CompanySearchCriteria): Promise<Paginated<CompanyListItem>> {
    const db = this.prisma.db;
    const { total, ids } = hasTextFilter(criteria.spec)
      ? await this.pageIdsWithText(criteria)
      : await this.pageIds(criteria);
    const rows =
      ids.length === 0
        ? []
        : await db.company.findMany({ where: { id: { in: ids } }, select: LIST_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const names = await this.catalogNames.resolve(rows);
    return {
      items: ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [toListItem(row, names)] : [];
      }),
      page: criteria.page,
      pageSize: criteria.pageSize,
      total,
    };
  }

  /** Sin texto: total y página con dos consultas baratas sobre índices (en paralelo). */
  private async pageIds(criteria: CompanySearchCriteria) {
    const where = toPrismaCompanyWhere(criteria.spec);
    const db = this.prisma.db;
    const [total, page] = await Promise.all([
      db.company.count({ where }),
      db.company.findMany({
        where,
        select: { id: true },
        orderBy: orderBy(criteria.sortBy, criteria.sortDir),
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
    ]);
    return { total, ids: page.map((r) => r.id) };
  }

  /**
   * Con texto, el LIKE '%…%' recorre todo companies_searchText_idx (~50 ms de CPU): página y total
   * salen de UNA pasada con COUNT(*) OVER () en lugar de dos (count + findMany).
   */
  private async pageIdsWithText(criteria: CompanySearchCriteria) {
    const where = toSqlCompanyWhere(criteria.spec);
    const column = Prisma.raw(`c.[${SORT_COLUMNS[criteria.sortBy]}]`);
    const dir = Prisma.raw(criteria.sortDir === 'desc' ? 'DESC' : 'ASC');
    const rows = await this.prisma.db.$queryRaw<{ id: number; total: number | bigint }[]>`
      SELECT c.[id], COUNT(*) OVER () AS [total]
      FROM [dbo].[companies] c
      WHERE ${where}
      ORDER BY ${column} ${dir}, c.[id] ${dir}
      OFFSET ${(criteria.page - 1) * criteria.pageSize} ROWS FETCH NEXT ${criteria.pageSize} ROWS ONLY`;
    if (rows.length > 0) return { total: Number(rows[0]?.total), ids: rows.map((r) => r.id) };
    // Página fuera de rango: no hay filas de las que leer el total.
    const total = await this.prisma.db.company.count({
      where: toPrismaCompanyWhere(criteria.spec),
    });
    return { total, ids: [] as number[] };
  }

  async getDetail(id: number): Promise<CompanyDetail | null> {
    const row = await this.prisma.db.company.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        legalRepName: true,
        legalRepIdNumber: true,
        shippingAddress: true,
        particularAddress: true,
        source: true,
        version: true,
        updatedAt: true,
        branches: { orderBy: { id: 'asc' } },
      },
    });
    if (!row) return null;
    return {
      ...toListItem(row, await this.catalogNames.resolve([row])),
      legalRepName: row.legalRepName,
      legalRepIdNumber: row.legalRepIdNumber,
      shippingAddress: row.shippingAddress,
      particularAddress: row.particularAddress,
      source: row.source as 'EXCEL' | 'MANUAL',
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      branches: row.branches.map((b) => ({
        id: b.id,
        tradeName: b.tradeName,
        address: b.address,
        phone: b.phone,
        employeeCount: b.employeeCount,
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }

  async existsByRuc(ruc: string): Promise<boolean> {
    const found = await this.prisma.db.company.findUnique({ where: { ruc }, select: { id: true } });
    return found !== null;
  }

  async findMissingCatalogRef(refs: {
    sectorId?: number | null;
    activityId?: number | null;
  }): Promise<'sector' | 'activity' | null> {
    const db = this.prisma.db;
    if (refs.sectorId != null) {
      const sector = await db.economicSector.findUnique({
        where: { id: refs.sectorId },
        select: { id: true },
      });
      if (!sector) return 'sector';
    }
    if (refs.activityId != null) {
      const activity = await db.economicActivity.findUnique({
        where: { id: refs.activityId },
        select: { id: true },
      });
      if (!activity) return 'activity';
    }
    return null;
  }
}
