import type {
  AssignmentDto,
  AssignmentsQuery,
  MyWeekItemDto,
  Paginated,
  PlanItemReason,
  SettingKey,
  UserRole,
} from '@axiom/contracts';
import type { Clock, UnitOfWork } from '../../../shared/application';
import type { CoverageRow, PlanView, PortfolioReadModel } from '../application/queries/read-ports';
import {
  type AssignmentRepository,
  type CompanyLookup,
  type CycleEvidence,
  type CycleEvidenceReader,
  type CycleRepository,
  type ExecutiveDirectory,
  type InstantRange,
  isAdvancedStatus,
  type LocalDate,
  type PlanCandidate,
  type PlanCandidateReader,
  type PoolCandidate,
  type PoolFilters,
  type PoolReader,
  PortfolioAssignment,
  type PortfolioAssignmentProps,
  type PortfolioSettings,
  type PortfolioSettingsProvider,
  type PortfolioUser,
  parsePortfolioSettings,
  RotationCycle,
  type RotationCycleProps,
  type WeeklyPlan,
  type WeeklyPlanRepository,
} from '../domain';

export interface CompanyRow {
  id: number;
  legalName: string;
  tradeName: string | null;
  status: string;
  employeeCount: number;
  phone: string | null;
  sectorId: number | null;
  activityId: number | null;
  lastContactAt: Date | null;
}
export interface InteractionRow {
  companyId: number;
  userId: number;
  occurredAt: Date;
  nextFollowUpAt: Date | null;
}
export interface HistoryRow {
  companyId: number;
  toStatus: string;
  changedAt: Date;
}
export interface AppointmentRow {
  companyId: number;
  scheduledAt: Date;
  status: string;
}
export interface PlanRow {
  id: number;
  userId: number;
  cycleId: number;
  weekNumber: number;
  weekStart: LocalDate;
  quota: number;
  generatedAt: Date;
}
export interface PlanItemRow {
  id: number;
  planId: number;
  companyId: number;
  priority: number;
  reason: PlanItemReason;
  contactedAt: Date | null;
}

/** Estado completo en memoria (equivalente a las tablas que lee/escribe el módulo). */
export class PortfolioWorld {
  settings: Partial<Record<SettingKey, string>> = {};
  users: PortfolioUser[] = [];
  companies = new Map<number, CompanyRow>();
  interactions: InteractionRow[] = [];
  history: HistoryRow[] = [];
  appointments: AppointmentRow[] = [];
  cycles: RotationCycleProps[] = [];
  assignments: PortfolioAssignmentProps[] = [];
  plans: PlanRow[] = [];
  items: PlanItemRow[] = [];
  private seq = 1000;

  nextId(): number {
    return this.seq++;
  }

  addUser(id: number, role: UserRole = 'EJECUTIVO', isActive = true): this {
    this.users.push({ id, fullName: `Usuario ${id}`, role, isActive });
    return this;
  }

  addCompanies(count: number, over: Partial<CompanyRow> = {}, firstId = 1): this {
    for (let i = 0; i < count; i++) {
      const id = firstId + i;
      this.companies.set(id, {
        id,
        legalName: `Empresa ${id}`,
        tradeName: null,
        status: 'POR_CONTACTAR',
        employeeCount: 0,
        phone: '8888-0000',
        sectorId: 1,
        activityId: 1,
        lastContactAt: null,
        ...over,
      });
    }
    return this;
  }

  active(): PortfolioAssignmentProps[] {
    return this.assignments.filter((a) => a.releasedAt === null);
  }

  clone(): PortfolioWorld {
    const copy = Object.assign(new PortfolioWorld(), structuredClone({ ...this }));
    copy.companies = new Map([...this.companies].map(([k, v]) => [k, { ...v }]));
    return copy;
  }

  restoreFrom(backup: PortfolioWorld): void {
    Object.assign(this, backup);
  }
}

const inRange = (d: Date | null, r: InstantRange) => d !== null && d >= r.start && d < r.end;

export class InMemorySettings implements PortfolioSettingsProvider {
  constructor(private readonly world: PortfolioWorld) {}
  async get(): Promise<PortfolioSettings> {
    return parsePortfolioSettings(this.world.settings).settings;
  }
}

export class InMemoryCycles implements CycleRepository {
  constructor(private readonly world: PortfolioWorld) {}
  async findLatest(): Promise<RotationCycle | null> {
    const latest = [...this.world.cycles].sort((a, b) => b.number - a.number)[0];
    return latest ? RotationCycle.restore({ ...latest }) : null;
  }
  async save(cycle: RotationCycle): Promise<void> {
    const props = cycle.toProps();
    if (props.id === null) {
      if (this.world.cycles.some((c) => c.number === props.number)) {
        throw new Error('unique violation rotation_cycles.number');
      }
      const id = this.world.nextId();
      cycle.assignId(id);
      this.world.cycles.push({ ...props, id });
      return;
    }
    const row = this.world.cycles.find((c) => c.id === props.id);
    if (row) row.closedAt = props.closedAt;
  }
}

export class InMemoryAssignments implements AssignmentRepository {
  constructor(private readonly world: PortfolioWorld) {}
  private restore = (p: PortfolioAssignmentProps) => PortfolioAssignment.restore({ ...p });

  async findById(id: number) {
    const row = this.world.assignments.find((a) => a.id === id);
    return row ? this.restore(row) : null;
  }
  async findActive(filter: { userId?: number } = {}) {
    return this.world
      .active()
      .filter((a) => filter.userId === undefined || a.userId === filter.userId)
      .map(this.restore);
  }
  async findActiveByCompanyIds(ids: number[]) {
    return this.world
      .active()
      .filter((a) => ids.includes(a.companyId))
      .map(this.restore);
  }
  async hasActive(userId: number, companyId: number) {
    return this.world.active().some((a) => a.userId === userId && a.companyId === companyId);
  }
  async countActiveByUser() {
    const counts = new Map<number, number>();
    for (const a of this.world.active()) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
    return counts;
  }
  async saveAll(assignments: PortfolioAssignment[]) {
    const changed = assignments.filter((a) => a.hasChanges);
    // Primero las liberaciones/actualizaciones y luego las altas (índice único filtrado).
    for (const a of changed.filter((x) => x.id !== null)) {
      const i = this.world.assignments.findIndex((r) => r.id === a.id);
      this.world.assignments[i] = a.toProps();
      a.markPersisted();
    }
    for (const a of changed.filter((x) => x.id === null)) {
      if (this.world.active().some((r) => r.companyId === a.companyId)) {
        throw new Error('unique violation portfolio_assignments_one_active_per_company');
      }
      a.assignId(this.world.nextId());
      this.world.assignments.push(a.toProps());
      a.markPersisted();
    }
  }
}

export class InMemoryPlans implements WeeklyPlanRepository {
  constructor(private readonly world: PortfolioWorld) {}
  async usersWithPlan(weekStart: LocalDate) {
    return new Set(this.world.plans.filter((p) => p.weekStart === weekStart).map((p) => p.userId));
  }
  async create(plan: WeeklyPlan) {
    const p = plan.props;
    if (this.world.plans.some((x) => x.userId === p.userId && x.weekStart === p.weekStart)) {
      return { created: false };
    }
    const id = this.world.nextId();
    this.world.plans.push({
      id,
      userId: p.userId,
      cycleId: p.cycleId,
      weekNumber: p.weekNumber,
      weekStart: p.weekStart,
      quota: p.quota,
      generatedAt: new Date(),
    });
    for (const item of p.items) {
      this.world.items.push({ id: this.world.nextId(), planId: id, ...item, contactedAt: null });
    }
    return { created: true };
  }
  async markItemContacted(itemId: number, companyId: number, at: Date) {
    const item = this.world.items.find(
      (i) => i.id === itemId && i.companyId === companyId && i.contactedAt === null,
    );
    if (!item) return 0;
    item.contactedAt = at;
    return 1;
  }
  async markCompanyContactedInWeek(companyId: number, weekStart: LocalDate, at: Date) {
    const planIds = new Set(
      this.world.plans.filter((p) => p.weekStart === weekStart).map((p) => p.id),
    );
    let n = 0;
    for (const i of this.world.items) {
      if (planIds.has(i.planId) && i.companyId === companyId && i.contactedAt === null) {
        i.contactedAt = at;
        n++;
      }
    }
    return n;
  }
}

export class InMemoryDirectory implements ExecutiveDirectory {
  constructor(private readonly world: PortfolioWorld) {}
  async listActiveExecutives() {
    return this.world.users
      .filter((u) => u.role === 'EJECUTIVO' && u.isActive)
      .sort((a, b) => a.id - b.id);
  }
  async findById(id: number) {
    return this.world.users.find((u) => u.id === id) ?? null;
  }
}

const IN_ROTATION = (c: CompanyRow) =>
  c.status !== 'CONTRATO_ACTIVO' && c.status !== 'DESCARTADO' && !!c.phone?.trim();

export class InMemoryPool implements PoolReader, CompanyLookup {
  constructor(private readonly world: PortfolioWorld) {}

  private poolRows(): PoolCandidate[] {
    const active = new Set(this.world.active().map((a) => a.companyId));
    return [...this.world.companies.values()]
      .filter((c) => IN_ROTATION(c) && !active.has(c.id))
      .map((c) => {
        const last = this.world.assignments
          .filter((a) => a.companyId === c.id)
          .sort((a, b) => (b.releasedAt?.getTime() ?? 0) - (a.releasedAt?.getTime() ?? 0))[0];
        return {
          companyId: c.id,
          employeeCount: c.employeeCount,
          sectorId: c.sectorId,
          previousOwnerId: last?.userId ?? null,
          recycled: last?.releaseReason === 'SIN_AVANCE',
        };
      });
  }

  async findCandidates(limit: number) {
    const rows = this.poolRows();
    const byEmployees = [...rows].sort(
      (a, b) => b.employeeCount - a.employeeCount || a.companyId - b.companyId,
    );
    const recycled = byEmployees.filter((r) => r.recycled).slice(0, limit);
    const ids = new Set(recycled.map((r) => r.companyId));
    return [...recycled, ...byEmployees.slice(0, limit).filter((r) => !ids.has(r.companyId))];
  }

  async findByFilters(filters: PoolFilters, limit: number) {
    return this.poolRows()
      .filter((r) => {
        const c = this.world.companies.get(r.companyId) as CompanyRow;
        return (
          (filters.sectorId === undefined || c.sectorId === filters.sectorId) &&
          (filters.activityId === undefined || c.activityId === filters.activityId) &&
          (filters.minEmployees === undefined || c.employeeCount >= filters.minEmployees)
        );
      })
      .sort((a, b) => b.employeeCount - a.employeeCount || a.companyId - b.companyId)
      .slice(0, limit);
  }

  async statuses(ids: number[]) {
    const map = new Map<number, string>();
    for (const id of ids) {
      const c = this.world.companies.get(id);
      if (c) map.set(id, c.status);
    }
    return map;
  }
}

export class InMemoryPlanCandidates implements PlanCandidateReader, CycleEvidenceReader {
  constructor(private readonly world: PortfolioWorld) {}

  async forUser(userId: number, windows: { cycle: InstantRange; week: InstantRange }) {
    const result: PlanCandidate[] = [];
    for (const a of this.world.active().filter((x) => x.userId === userId)) {
      const c = this.world.companies.get(a.companyId);
      if (!c) continue;
      const commitments = [
        ...this.world.interactions
          .filter((i) => i.companyId === c.id && inRange(i.nextFollowUpAt, windows.week))
          .map((i) => i.nextFollowUpAt as Date),
        ...this.world.appointments
          .filter(
            (ap) =>
              ap.companyId === c.id &&
              (ap.status === 'PROGRAMADA' || ap.status === 'REPROGRAMADA') &&
              inRange(ap.scheduledAt, windows.week),
          )
          .map((ap) => ap.scheduledAt),
      ].sort((x, y) => x.getTime() - y.getTime());
      result.push({
        companyId: c.id,
        status: c.status,
        employeeCount: c.employeeCount,
        lastContactAt: c.lastContactAt,
        followUpAt: commitments[0] ?? null,
        contactedThisCycle: this.world.interactions.some(
          (i) => i.companyId === c.id && inRange(i.occurredAt, windows.cycle),
        ),
      });
    }
    return result;
  }

  async forCompanies(ids: number[], window: InstantRange) {
    const map = new Map<number, CycleEvidence>();
    for (const id of ids) {
      const c = this.world.companies.get(id);
      if (!c) continue;
      map.set(id, {
        companyId: id,
        currentStatus: c.status,
        advancedTransitions: this.world.history.filter(
          (h) => h.companyId === id && isAdvancedStatus(h.toStatus) && inRange(h.changedAt, window),
        ).length,
        interactions: this.world.interactions.filter(
          (i) => i.companyId === id && inRange(i.occurredAt, window),
        ).length,
      });
    }
    return map;
  }
}

export class InMemoryReadModel implements PortfolioReadModel {
  constructor(private readonly world: PortfolioWorld) {}

  async weekPlan(userId: number, weekStart: LocalDate): Promise<PlanView> {
    const plan = this.world.plans.find((p) => p.userId === userId && p.weekStart === weekStart);
    if (!plan) return { plan: null, items: [] };
    const items: MyWeekItemDto[] = this.world.items
      .filter((i) => i.planId === plan.id)
      .sort((a, b) => a.priority - b.priority)
      .map((i) => {
        const c = this.world.companies.get(i.companyId) as CompanyRow;
        const next = this.world.interactions
          .filter((x) => x.companyId === c.id && x.nextFollowUpAt)
          .sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime())[0];
        return {
          itemId: i.id,
          companyId: c.id,
          legalName: c.legalName,
          tradeName: c.tradeName,
          phone: c.phone,
          status: c.status,
          reason: i.reason,
          priority: i.priority,
          contactedAt: i.contactedAt?.toISOString() ?? null,
          lastContactAt: c.lastContactAt?.toISOString() ?? null,
          nextFollowUpAt: next?.nextFollowUpAt?.toISOString() ?? null,
        };
      });
    return { plan: { id: plan.id, quota: plan.quota, generatedAt: plan.generatedAt }, items };
  }

  async coverage(cycleWindow: InstantRange, weekStart: LocalDate): Promise<CoverageRow[]> {
    const users = [...new Set(this.world.active().map((a) => a.userId))];
    return users.map((userId) => {
      const companies = this.world.active().filter((a) => a.userId === userId);
      const contacted = companies.filter((a) =>
        this.world.interactions.some(
          (i) => i.companyId === a.companyId && inRange(i.occurredAt, cycleWindow),
        ),
      ).length;
      const plan = this.world.plans.find((p) => p.userId === userId && p.weekStart === weekStart);
      const items = plan ? this.world.items.filter((i) => i.planId === plan.id) : [];
      return {
        userId,
        assigned: companies.length,
        contactedThisCycle: contacted,
        plan: plan
          ? {
              planId: plan.id,
              items: items.length,
              contacted: items.filter((i) => i.contactedAt !== null).length,
              quota: plan.quota,
            }
          : null,
      };
    });
  }

  async assignments(query: AssignmentsQuery): Promise<Paginated<AssignmentDto>> {
    const rows = this.world
      .active()
      .filter((a) => query.userId === undefined || a.userId === query.userId)
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const page = rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length,
      items: page.map((a) => {
        const c = this.world.companies.get(a.companyId) as CompanyRow;
        return {
          id: a.id as number,
          companyId: c.id,
          legalName: c.legalName,
          tradeName: c.tradeName,
          phone: c.phone,
          status: c.status,
          employeeCount: c.employeeCount,
          lastContactAt: c.lastContactAt?.toISOString() ?? null,
          userId: a.userId,
          userName: `Usuario ${a.userId}`,
          cycleId: a.cycleId,
          assignedAt: a.assignedAt.toISOString(),
          cyclesWithoutProgress: a.cyclesWithoutProgress,
        };
      }),
    };
  }
}

/** UoW falsa: deshace los cambios del mundo si el trabajo falla. */
export class WorldUnitOfWork implements UnitOfWork {
  runs = 0;
  rolledBack = 0;
  constructor(private readonly world: PortfolioWorld) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs++;
    const backup = this.world.clone();
    try {
      return await work();
    } catch (error) {
      this.world.restoreFrom(backup);
      this.rolledBack++;
      throw error;
    }
  }
}

export class MutableClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
}

/** Todos los adaptadores en memoria sobre el mismo mundo. */
export function inMemoryPortfolio(world = new PortfolioWorld()) {
  const pool = new InMemoryPool(world);
  const candidates = new InMemoryPlanCandidates(world);
  return {
    world,
    settings: new InMemorySettings(world),
    cycles: new InMemoryCycles(world),
    assignments: new InMemoryAssignments(world),
    plans: new InMemoryPlans(world),
    directory: new InMemoryDirectory(world),
    pool,
    lookup: pool,
    candidates,
    evidence: candidates,
    read: new InMemoryReadModel(world),
    uow: new WorldUnitOfWork(world),
  };
}
