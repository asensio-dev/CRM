import {
  type ReleaseReason,
  SETTING_DEFAULTS,
  type SettingKey,
  type UserRole,
} from '@axiom/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  type AssignmentRepository,
  type CycleRepository,
  type ExecutiveDirectory,
  fromUtcMidnight,
  type LocalDate,
  PortfolioAssignment,
  type PortfolioSettings,
  type PortfolioSettingsProvider,
  type PortfolioUser,
  parsePortfolioSettings,
  RotationCycle,
  toUtcMidnight,
  type WeeklyPlan,
  type WeeklyPlanRepository,
} from '../../domain';

/** SQL Server admite 2 100 parámetros por consulta: los `IN (…)` se trocean. */
export const ID_CHUNK = 1000;
export function chunk<T>(values: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

@Injectable()
export class PrismaPortfolioSettings implements PortfolioSettingsProvider {
  private readonly logger = new Logger(PrismaPortfolioSettings.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PortfolioSettings> {
    const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
    const rows = await this.prisma.db.setting.findMany({ where: { key: { in: keys } } });
    const raw = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<
      Record<SettingKey, string>
    >;
    const { settings, invalid } = parsePortfolioSettings(raw);
    if (invalid.length > 0) {
      this.logger.warn(
        `Parámetros inválidos, se usan los valores por defecto: ${invalid.join(', ')}`,
      );
    }
    return settings;
  }
}

@Injectable()
export class PrismaCycleRepository implements CycleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatest(): Promise<RotationCycle | null> {
    const row = await this.prisma.db.rotationCycle.findFirst({ orderBy: { number: 'desc' } });
    return row
      ? RotationCycle.restore({
          id: row.id,
          number: row.number,
          startDate: fromUtcMidnight(row.startDate),
          endDate: fromUtcMidnight(row.endDate),
          closedAt: row.closedAt,
        })
      : null;
  }

  async save(cycle: RotationCycle): Promise<void> {
    const p = cycle.toProps();
    if (p.id === null) {
      const row = await this.prisma.db.rotationCycle.create({
        data: {
          number: p.number,
          startDate: toUtcMidnight(p.startDate),
          endDate: toUtcMidnight(p.endDate),
          closedAt: p.closedAt,
        },
      });
      cycle.assignId(row.id);
      return;
    }
    await this.prisma.db.rotationCycle.update({
      where: { id: p.id },
      data: { closedAt: p.closedAt },
    });
  }
}

interface AssignmentRow {
  id: number;
  companyId: number;
  userId: number;
  cycleId: number;
  assignedAt: Date;
  releasedAt: Date | null;
  releaseReason: string | null;
  cyclesWithoutProgress: number;
}

const toAssignment = (r: AssignmentRow) =>
  PortfolioAssignment.restore({ ...r, releaseReason: r.releaseReason as ReleaseReason | null });

@Injectable()
export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const row = await this.prisma.db.portfolioAssignment.findUnique({ where: { id } });
    return row ? toAssignment(row) : null;
  }

  async findActive(filter: { userId?: number } = {}) {
    const rows = await this.prisma.db.portfolioAssignment.findMany({
      where: {
        releasedAt: null,
        ...(filter.userId !== undefined ? { userId: filter.userId } : {}),
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(toAssignment);
  }

  async findActiveByCompanyIds(companyIds: number[]) {
    const result: PortfolioAssignment[] = [];
    for (const ids of chunk(companyIds)) {
      const rows = await this.prisma.db.portfolioAssignment.findMany({
        where: { releasedAt: null, companyId: { in: ids } },
      });
      result.push(...rows.map(toAssignment));
    }
    return result;
  }

  async hasActive(userId: number, companyId: number) {
    const row = await this.prisma.db.portfolioAssignment.findFirst({
      where: { companyId, userId, releasedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  async countActiveByUser() {
    const rows = await this.prisma.db.portfolioAssignment.groupBy({
      by: ['userId'],
      where: { releasedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.userId, r._count._all]));
  }

  /**
   * Actualizaciones agrupadas por valores idénticos (un UPDATE … WHERE id IN (…) por grupo) y
   * después las altas con createMany: primero se liberan las previas para no chocar con el
   * índice único filtrado "una asignación activa por empresa".
   * Las altas no reciben id (SQL Server no soporta createManyAndReturn).
   */
  async saveAll(assignments: PortfolioAssignment[]) {
    const changed = assignments.filter((a) => a.hasChanges);
    type Group = { ids: number[]; data: Partial<AssignmentRow> };
    const groups = new Map<string, Group>();
    for (const a of changed) {
      if (a.id === null) continue;
      const data = {
        releasedAt: a.releasedAt,
        releaseReason: a.releaseReason,
        cyclesWithoutProgress: a.cyclesWithoutProgress,
      };
      const key = JSON.stringify(data);
      const group: Group = groups.get(key) ?? { ids: [], data };
      group.ids.push(a.id);
      groups.set(key, group);
    }
    for (const { ids, data } of groups.values()) {
      for (const part of chunk(ids)) {
        await this.prisma.db.portfolioAssignment.updateMany({ where: { id: { in: part } }, data });
      }
    }
    const fresh = changed.filter((a) => a.id === null);
    for (const part of chunk(fresh, 300)) {
      await this.prisma.db.portfolioAssignment.createMany({
        data: part.map((a) => ({
          companyId: a.companyId,
          userId: a.userId,
          cycleId: a.cycleId,
          assignedAt: a.assignedAt,
          cyclesWithoutProgress: a.cyclesWithoutProgress,
        })),
      });
    }
    for (const a of changed) a.markPersisted();
  }
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { code?: string }).code === 'P2002' ||
    /weekly_plans_userId_weekStart_key|duplicate key/i.test(String((error as Error).message)));

@Injectable()
export class PrismaWeeklyPlanRepository implements WeeklyPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async usersWithPlan(weekStart: LocalDate) {
    const rows = await this.prisma.db.weeklyPlan.findMany({
      where: { weekStart: toUtcMidnight(weekStart) },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  async create(plan: WeeklyPlan) {
    const p = plan.props;
    try {
      await this.prisma.db.weeklyPlan.create({
        data: {
          userId: p.userId,
          cycleId: p.cycleId,
          weekNumber: p.weekNumber,
          weekStart: toUtcMidnight(p.weekStart),
          quota: p.quota,
          items: {
            createMany: {
              data: p.items.map((i) => ({
                companyId: i.companyId,
                priority: i.priority,
                reason: i.reason,
              })),
            },
          },
        },
      });
      return { created: true };
    } catch (error) {
      if (isUniqueViolation(error)) return { created: false };
      throw error;
    }
  }

  async markItemContacted(itemId: number, companyId: number, at: Date) {
    const { count } = await this.prisma.db.weeklyPlanItem.updateMany({
      where: { id: itemId, companyId, contactedAt: null },
      data: { contactedAt: at },
    });
    return count;
  }

  async markCompanyContactedInWeek(companyId: number, weekStart: LocalDate, at: Date) {
    const { count } = await this.prisma.db.weeklyPlanItem.updateMany({
      where: { companyId, contactedAt: null, plan: { weekStart: toUtcMidnight(weekStart) } },
      data: { contactedAt: at },
    });
    return count;
  }
}

const toUser = (u: {
  id: number;
  fullName: string;
  role: string;
  isActive: boolean;
}): PortfolioUser => ({
  id: u.id,
  fullName: u.fullName,
  role: u.role as UserRole,
  isActive: u.isActive,
});

@Injectable()
export class PrismaExecutiveDirectory implements ExecutiveDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveExecutives() {
    const rows = await this.prisma.db.user.findMany({
      where: { role: 'EJECUTIVO', isActive: true },
      select: { id: true, fullName: true, role: true, isActive: true },
      orderBy: { id: 'asc' },
    });
    return rows.map(toUser);
  }

  async findById(id: number) {
    const row = await this.prisma.db.user.findUnique({
      where: { id },
      select: { id: true, fullName: true, role: true, isActive: true },
    });
    return row ? toUser(row) : null;
  }
}
