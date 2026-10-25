import type { AssignmentDto, AssignmentsQuery, Paginated, PlanItemReason } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type {
  CoverageRow,
  PlanView,
  PortfolioReadModel,
} from '../../application/queries/read-ports';
import {
  ADVANCED_STATUSES,
  type CompanyLookup,
  type CycleEvidence,
  type CycleEvidenceReader,
  type InstantRange,
  type LocalDate,
  type PlanCandidate,
  type PlanCandidateReader,
  type PoolCandidate,
  type PoolFilters,
  type PoolReader,
  toUtcMidnight,
} from '../../domain';
import { chunk } from './prisma-portfolio.repositories';

/**
 * Pool = empresas en rotación (ni CONTRATO_ACTIVO ni DESCARTADO), con teléfono y sin asignación
 * activa. El NOT EXISTS usa el índice único filtrado `portfolio_assignments_one_active_per_company`.
 */
const POOL_WHERE = Prisma.sql`
  c.[status] NOT IN (N'CONTRATO_ACTIVO', N'DESCARTADO')
  AND c.[phone] IS NOT NULL AND LTRIM(RTRIM(c.[phone])) <> N''
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[portfolio_assignments] pa
    WHERE pa.[companyId] = c.[id] AND pa.[releasedAt] IS NULL
  )`;

/** Última asignación (liberada) de la empresa. */
const LAST_ASSIGNMENT = Prisma.sql`
  SELECT TOP (1) la.[userId], la.[releaseReason]
  FROM [dbo].[portfolio_assignments] la
  WHERE la.[companyId] = x.[id]
  ORDER BY la.[releasedAt] DESC, la.[id] DESC`;

interface PoolRow {
  id: number;
  employeeCount: number;
  sectorId: number | null;
  previousOwnerId: number | null;
  lastReason: string | null;
}

const toPoolCandidate = (r: PoolRow): PoolCandidate => ({
  companyId: r.id,
  employeeCount: r.employeeCount,
  sectorId: r.sectorId,
  previousOwnerId: r.previousOwnerId,
  recycled: r.lastReason === 'SIN_AVANCE',
});

@Injectable()
export class PrismaPoolReader implements PoolReader, CompanyLookup {
  constructor(private readonly prisma: PrismaService) {}

  /** TOP N del pool por empleados; la última asignación se busca solo para esas N filas. */
  private topByEmployees(limit: number, extra: Prisma.Sql = Prisma.empty): Promise<PoolRow[]> {
    return this.prisma.db.$queryRaw<PoolRow[]>`
      SELECT x.[id], x.[employeeCount], x.[sectorId],
             last.[userId] AS previousOwnerId, last.[releaseReason] AS lastReason
      FROM (
        SELECT TOP (${limit}) c.[id], c.[employeeCount], c.[sectorId]
        FROM [dbo].[companies] c
        WHERE ${POOL_WHERE} ${extra}
        ORDER BY c.[employeeCount] DESC, c.[id] ASC
      ) x
      OUTER APPLY (${LAST_ASSIGNMENT}) last
      ORDER BY x.[employeeCount] DESC, x.[id] ASC`;
  }

  async findCandidates(limit: number): Promise<PoolCandidate[]> {
    // Recicladas: se parte de las liberaciones SIN_AVANCE (pocas) en lugar de recorrer el pool.
    const recycled = await this.prisma.db.$queryRaw<PoolRow[]>`
      SELECT TOP (${limit}) x.[id], x.[employeeCount], x.[sectorId],
             last.[userId] AS previousOwnerId, last.[releaseReason] AS lastReason
      FROM [dbo].[companies] x
      CROSS APPLY (${LAST_ASSIGNMENT}) last
      WHERE x.[id] IN (
          SELECT r.[companyId] FROM [dbo].[portfolio_assignments] r
          WHERE r.[releaseReason] = N'SIN_AVANCE')
        AND last.[releaseReason] = N'SIN_AVANCE'
        AND EXISTS (SELECT 1 FROM [dbo].[companies] c WHERE c.[id] = x.[id] AND ${POOL_WHERE})
      ORDER BY x.[employeeCount] DESC, x.[id] ASC`;
    const fresh = await this.topByEmployees(limit);
    const seen = new Set(recycled.map((r) => r.id));
    return [...recycled, ...fresh.filter((r) => !seen.has(r.id))].map(toPoolCandidate);
  }

  async findByFilters(filters: PoolFilters, limit: number): Promise<PoolCandidate[]> {
    const conditions: Prisma.Sql[] = [];
    if (filters.sectorId !== undefined)
      conditions.push(Prisma.sql`c.[sectorId] = ${filters.sectorId}`);
    if (filters.activityId !== undefined) {
      conditions.push(Prisma.sql`c.[activityId] = ${filters.activityId}`);
    }
    if (filters.minEmployees !== undefined) {
      conditions.push(Prisma.sql`c.[employeeCount] >= ${filters.minEmployees}`);
    }
    const extra =
      conditions.length > 0 ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    return (await this.topByEmployees(limit, extra)).map(toPoolCandidate);
  }

  async statuses(companyIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    for (const ids of chunk(companyIds)) {
      const rows = await this.prisma.db.company.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true },
      });
      for (const r of rows) map.set(r.id, r.status);
    }
    return map;
  }
}

interface CandidateRow {
  id: number;
  status: string;
  employeeCount: number;
  lastContactAt: Date | null;
  followUpAt: Date | null;
  contacted: number | boolean;
}

interface EvidenceRow {
  id: number;
  status: string;
  advanced: number;
  interactions: number;
}

@Injectable()
export class PrismaPlanCandidateReader implements PlanCandidateReader, CycleEvidenceReader {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(
    userId: number,
    windows: { cycle: InstantRange; week: InstantRange },
  ): Promise<PlanCandidate[]> {
    const { cycle, week } = windows;
    const rows = await this.prisma.db.$queryRaw<CandidateRow[]>`
      SELECT c.[id], c.[status], c.[employeeCount], c.[lastContactAt], fu.[followUpAt],
        CASE WHEN EXISTS (
          SELECT 1 FROM [dbo].[interactions] i
          WHERE i.[companyId] = c.[id] AND i.[occurredAt] >= ${cycle.start} AND i.[occurredAt] < ${cycle.end}
        ) THEN 1 ELSE 0 END AS contacted
      FROM [dbo].[portfolio_assignments] pa
      JOIN [dbo].[companies] c ON c.[id] = pa.[companyId]
      OUTER APPLY (
        SELECT MIN(t.[at]) AS followUpAt FROM (
          SELECT i.[nextFollowUpAt] AS [at] FROM [dbo].[interactions] i
          WHERE i.[companyId] = c.[id]
            AND i.[nextFollowUpAt] >= ${week.start} AND i.[nextFollowUpAt] < ${week.end}
          UNION ALL
          SELECT a.[scheduledAt] FROM [dbo].[appointments] a
          WHERE a.[companyId] = c.[id] AND a.[status] IN (N'PROGRAMADA', N'REPROGRAMADA')
            AND a.[scheduledAt] >= ${week.start} AND a.[scheduledAt] < ${week.end}
        ) t
      ) fu
      WHERE pa.[userId] = ${userId} AND pa.[releasedAt] IS NULL`;
    return rows.map((r) => ({
      companyId: r.id,
      status: r.status,
      employeeCount: r.employeeCount,
      lastContactAt: r.lastContactAt,
      followUpAt: r.followUpAt,
      contactedThisCycle: Number(r.contacted) === 1,
    }));
  }

  async forCompanies(companyIds: number[], window: InstantRange) {
    const map = new Map<number, CycleEvidence>();
    const advanced = Prisma.join(ADVANCED_STATUSES.map((s) => Prisma.sql`${s}`));
    for (const ids of chunk(companyIds)) {
      const rows = await this.prisma.db.$queryRaw<EvidenceRow[]>`
        SELECT c.[id], c.[status],
          (SELECT COUNT(*) FROM [dbo].[status_history] h
            WHERE h.[companyId] = c.[id] AND h.[changedAt] >= ${window.start} AND h.[changedAt] < ${window.end}
              AND h.[toStatus] IN (${advanced})) AS advanced,
          (SELECT COUNT(*) FROM [dbo].[interactions] i
            WHERE i.[companyId] = c.[id] AND i.[occurredAt] >= ${window.start} AND i.[occurredAt] < ${window.end}) AS interactions
        FROM [dbo].[companies] c
        WHERE c.[id] IN (${Prisma.join(ids)})`;
      for (const r of rows) {
        map.set(r.id, {
          companyId: r.id,
          currentStatus: r.status,
          advancedTransitions: Number(r.advanced),
          interactions: Number(r.interactions),
        });
      }
    }
    return map;
  }
}

interface PlanItemRow {
  itemId: number;
  companyId: number;
  legalName: string;
  tradeName: string | null;
  phone: string | null;
  status: string;
  reason: string;
  priority: number;
  contactedAt: Date | null;
  lastContactAt: Date | null;
  nextFollowUpAt: Date | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

@Injectable()
export class PrismaPortfolioReadModel implements PortfolioReadModel {
  constructor(private readonly prisma: PrismaService) {}

  async weekPlan(userId: number, weekStart: LocalDate): Promise<PlanView> {
    const plan = await this.prisma.db.weeklyPlan.findUnique({
      where: { userId_weekStart: { userId, weekStart: toUtcMidnight(weekStart) } },
      select: { id: true, quota: true, generatedAt: true },
    });
    if (!plan) return { plan: null, items: [] };
    const rows = await this.prisma.db.$queryRaw<PlanItemRow[]>`
      SELECT wi.[id] AS itemId, c.[id] AS companyId, c.[legalName], c.[tradeName], c.[phone],
             c.[status], wi.[reason], wi.[priority], wi.[contactedAt], c.[lastContactAt],
             nf.[nextFollowUpAt]
      FROM [dbo].[weekly_plan_items] wi
      JOIN [dbo].[companies] c ON c.[id] = wi.[companyId]
      OUTER APPLY (
        SELECT TOP (1) i.[nextFollowUpAt] FROM [dbo].[interactions] i
        WHERE i.[companyId] = c.[id] AND i.[nextFollowUpAt] IS NOT NULL
        ORDER BY i.[occurredAt] DESC, i.[id] DESC
      ) nf
      WHERE wi.[planId] = ${plan.id}
      ORDER BY wi.[priority] ASC`;
    return {
      plan,
      items: rows.map((r) => ({
        itemId: r.itemId,
        companyId: r.companyId,
        legalName: r.legalName,
        tradeName: r.tradeName,
        phone: r.phone,
        status: r.status,
        reason: r.reason as PlanItemReason,
        priority: r.priority,
        contactedAt: iso(r.contactedAt),
        lastContactAt: iso(r.lastContactAt),
        nextFollowUpAt: iso(r.nextFollowUpAt),
      })),
    };
  }

  async coverage(cycleWindow: InstantRange, weekStart: LocalDate): Promise<CoverageRow[]> {
    const portfolio = await this.prisma.db.$queryRaw<
      { userId: number; assigned: number; contacted: number }[]
    >`
      SELECT pa.[userId], COUNT(*) AS assigned, COUNT(ct.[companyId]) AS contacted
      FROM [dbo].[portfolio_assignments] pa
      LEFT JOIN (
        SELECT DISTINCT i.[companyId] FROM [dbo].[interactions] i
        WHERE i.[occurredAt] >= ${cycleWindow.start} AND i.[occurredAt] < ${cycleWindow.end}
      ) ct ON ct.[companyId] = pa.[companyId]
      WHERE pa.[releasedAt] IS NULL
      GROUP BY pa.[userId]`;
    const plans = await this.prisma.db.$queryRaw<
      { planId: number; userId: number; quota: number; items: number; contacted: number }[]
    >`
      SELECT p.[id] AS planId, p.[userId], p.[quota],
             COUNT(wi.[id]) AS items, COUNT(wi.[contactedAt]) AS contacted
      FROM [dbo].[weekly_plans] p
      LEFT JOIN [dbo].[weekly_plan_items] wi ON wi.[planId] = p.[id]
      WHERE p.[weekStart] = ${toUtcMidnight(weekStart)}
      GROUP BY p.[id], p.[userId], p.[quota]`;
    const planByUser = new Map(plans.map((p) => [p.userId, p]));
    return portfolio.map((r) => {
      const p = planByUser.get(r.userId);
      return {
        userId: r.userId,
        assigned: Number(r.assigned),
        contactedThisCycle: Number(r.contacted),
        plan: p
          ? {
              planId: p.planId,
              items: Number(p.items),
              contacted: Number(p.contacted),
              quota: p.quota,
            }
          : null,
      };
    });
  }

  async assignments(query: AssignmentsQuery): Promise<Paginated<AssignmentDto>> {
    const where = {
      releasedAt: null,
      ...(query.userId !== undefined ? { userId: query.userId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.db.portfolioAssignment.count({ where }),
      this.prisma.db.portfolioAssignment.findMany({
        where,
        orderBy: [{ userId: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          userId: true,
          cycleId: true,
          assignedAt: true,
          cyclesWithoutProgress: true,
          user: { select: { fullName: true } },
          company: {
            select: {
              id: true,
              legalName: true,
              tradeName: true,
              phone: true,
              status: true,
              employeeCount: true,
              lastContactAt: true,
            },
          },
        },
      }),
    ]);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: rows.map((r) => ({
        id: r.id,
        companyId: r.company.id,
        legalName: r.company.legalName,
        tradeName: r.company.tradeName,
        phone: r.company.phone,
        status: r.company.status,
        employeeCount: r.company.employeeCount,
        lastContactAt: iso(r.company.lastContactAt),
        userId: r.userId,
        userName: r.user.fullName,
        cycleId: r.cycleId,
        assignedAt: r.assignedAt.toISOString(),
        cyclesWithoutProgress: r.cyclesWithoutProgress,
      })),
    };
  }
}
