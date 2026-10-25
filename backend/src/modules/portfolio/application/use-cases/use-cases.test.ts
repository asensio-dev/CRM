import { beforeEach, describe, expect, test } from 'bun:test';
import { DomainError } from '../../../../shared/domain';
import { DefaultPoolSelectionStrategy, DefaultPrioritizationStrategy } from '../../domain';
import {
  inMemoryPortfolio,
  MutableClock,
  type PortfolioWorld,
} from '../../testing/in-memory-portfolio';
import {
  GetCurrentCycleQuery,
  GetMyWeekQuery,
  ListAssignmentsQuery,
} from '../queries/portfolio-queries';
import { PortfolioCompanyAccessPolicy } from '../services/portfolio-company-access.policy';
import { RotationContext } from '../services/rotation-context';
import {
  BulkAssignCompaniesUseCase,
  ReassignCompaniesUseCase,
  ReleaseAssignmentUseCase,
} from './assignment-commands.use-case';
import { CloseCycleUseCase } from './close-cycle.use-case';
import { GenerateWeeklyPlansUseCase } from './generate-weekly-plans.use-case';
import {
  MarkPlanItemContactedUseCase,
  ReleaseOnStatusChangeUseCase,
} from './pipeline-reactions.use-case';
import { RefillPortfoliosUseCase } from './refill-portfolios.use-case';
import { RunWeeklyRotationUseCase } from './run-weekly-rotation.use-case';

/** Lunes 26-oct-2026 06:00 en Managua (hora del cron). */
const MONDAY_6AM = new Date('2026-10-26T12:00:00Z');
const WEEK = 7 * 86_400_000;
const later = (weeks: number) => new Date(MONDAY_6AM.getTime() + weeks * WEEK);

const SUPERVISOR = { userId: 2, role: 'SUPERVISOR' as const };
const ADMIN = { userId: 1, role: 'ADMIN' as const };

function build(world?: PortfolioWorld) {
  const p = inMemoryPortfolio(world);
  const clock = new MutableClock(MONDAY_6AM);
  const context = new RotationContext(p.settings, p.cycles, clock);
  const close = new CloseCycleUseCase(p.assignments, p.cycles, p.evidence, p.uow);
  const refill = new RefillPortfoliosUseCase(
    p.assignments,
    p.directory,
    p.pool,
    new DefaultPoolSelectionStrategy(),
    p.uow,
  );
  const plans = new GenerateWeeklyPlansUseCase(
    p.directory,
    p.candidates,
    new DefaultPrioritizationStrategy(),
    p.plans,
  );
  return {
    ...p,
    clock,
    context,
    run: new RunWeeklyRotationUseCase(context, p.cycles, p.uow, close, refill, plans),
    reassign: new ReassignCompaniesUseCase(context, p.assignments, p.directory, p.lookup, p.uow),
    bulk: new BulkAssignCompaniesUseCase(context, p.assignments, p.directory, p.pool, p.uow),
    release: new ReleaseAssignmentUseCase(context, p.assignments, p.uow),
    markContacted: new MarkPlanItemContactedUseCase(p.plans, p.settings),
    releaseOnStatus: new ReleaseOnStatusChangeUseCase(p.assignments, p.uow),
    access: new PortfolioCompanyAccessPolicy(p.assignments),
    myWeek: new GetMyWeekQuery(context, p.read),
    currentCycle: new GetCurrentCycleQuery(context, p.read, p.directory),
    list: new ListAssignmentsQuery(p.read),
  };
}

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('valor esperado');
  return value;
}

let s: ReturnType<typeof build>;

beforeEach(() => {
  s = build();
  // 3 ejecutivos (10, 11, 12), un supervisor y 250 empresas con empleados distintos
  s.world.addUser(1, 'ADMIN').addUser(2, 'SUPERVISOR').addUser(10).addUser(11).addUser(12);
  for (let i = 1; i <= 250; i++) s.world.addCompanies(1, { employeeCount: i }, i);
});

describe('RunWeeklyRotationUseCase — first run', () => {
  test('opens cycle 1, fills 60 per executive and generates 20-item plans', async () => {
    const result = await s.run.execute();

    expect(result.closedCycle).toBeNull();
    expect(result.openedCycle).toBe(1);
    expect(result.week).toMatchObject({
      weekNumber: 1,
      totalWeeks: 3,
      weekStart: '2026-10-26',
      weekEnd: '2026-11-01',
      cycle: { number: 1, startDate: '2026-10-26', endDate: '2026-11-15' },
    });
    expect(result.refill).toEqual({ executives: 3, assigned: 180, shortfall: 0 });
    expect(result.plans).toEqual({ generated: 3, existing: 0, items: 60 });

    const counts = await s.assignments.countActiveByUser();
    expect([...counts.values()]).toEqual([60, 60, 60]);
    // las mejores empresas se reparten (round-robin): la 250, 249 y 248 en carteras distintas
    const owners = [250, 249, 248].map(
      (id) => s.world.active().find((a) => a.companyId === id)?.userId,
    );
    expect(new Set(owners).size).toBe(3);
  });

  test('is idempotent: a second run changes nothing', async () => {
    await s.run.execute();
    const before = structuredClone({ a: s.world.assignments, p: s.world.plans, i: s.world.items });
    const again = await s.run.execute();
    expect(again.openedCycle).toBeNull();
    expect(again.refill.assigned).toBe(0);
    expect(again.plans).toEqual({ generated: 0, existing: 3, items: 0 });
    expect({ a: s.world.assignments, p: s.world.plans, i: s.world.items }).toEqual(before);
  });

  test('concurrent calls share one execution', async () => {
    const [a, b] = await Promise.all([s.run.execute(), s.run.execute()]);
    expect(a).toBe(b);
    expect(s.world.cycles).toHaveLength(1);
  });

  test('never auto-assigns companies without phone or out of rotation', async () => {
    must(s.world.companies.get(250)).phone = null;
    must(s.world.companies.get(249)).phone = '  ';
    must(s.world.companies.get(248)).status = 'CONTRATO_ACTIVO';
    must(s.world.companies.get(247)).status = 'DESCARTADO';
    await s.run.execute();
    const assigned = new Set(s.world.active().map((a) => a.companyId));
    for (const id of [250, 249, 248, 247]) expect(assigned.has(id)).toBe(false);
  });

  test('reports shortfall when the pool is too small', async () => {
    const small = build();
    small.world.addUser(10).addUser(11).addCompanies(70);
    const result = await small.run.execute();
    expect(result.refill).toEqual({ executives: 2, assigned: 70, shortfall: 50 });
  });

  test('respects configured settings (2 weeks × 5 = 10)', async () => {
    s.world.settings = { ROTATION_CYCLE_WEEKS: '2', WEEKLY_CONTACT_QUOTA: '5' };
    const result = await s.run.execute();
    expect(result.week.cycle.endDate).toBe('2026-11-08');
    expect(result.refill.assigned).toBe(30);
    expect(result.plans.items).toBe(15);
  });
});

describe('weekly plans across the cycle', () => {
  test('week 2 favours companies not yet contacted in the cycle', async () => {
    await s.run.execute();
    const firstPlan = must(s.world.plans.find((p) => p.userId === 10));
    const week1 = s.world.items.filter((i) => i.planId === firstPlan.id).map((i) => i.companyId);
    // el ejecutivo contacta todo el plan de la semana 1
    for (const companyId of week1) {
      s.world.interactions.push({
        companyId,
        userId: 10,
        occurredAt: new Date('2026-10-27T15:00:00Z'),
        nextFollowUpAt: null,
      });
      must(s.world.companies.get(companyId)).status = 'SIN_RESPUESTA';
      must(s.world.companies.get(companyId)).lastContactAt = new Date('2026-10-27T15:00:00Z');
    }
    s.clock.current = later(1);
    const result = await s.run.execute();
    expect(result.week.weekNumber).toBe(2);
    const plan2 = must(s.world.plans.find((p) => p.userId === 10 && p.weekStart === '2026-11-02'));
    const week2 = s.world.items.filter((i) => i.planId === plan2.id).map((i) => i.companyId);
    expect(week2).toHaveLength(20);
    expect(week2.some((id) => week1.includes(id))).toBe(false);
  });

  test('follow-ups due this week and appointments come first as SEGUIMIENTO', async () => {
    await s.run.execute();
    const mine = s.world
      .active()
      .filter((a) => a.userId === 11)
      .map((a) => a.companyId);
    const [followUp, appointment] = [mine[50] as number, mine[55] as number];
    s.world.interactions.push({
      companyId: followUp,
      userId: 11,
      occurredAt: new Date('2026-10-28T15:00:00Z'),
      nextFollowUpAt: new Date('2026-11-04T16:00:00Z'),
    });
    s.world.appointments.push({
      companyId: appointment,
      scheduledAt: new Date('2026-11-03T16:00:00Z'),
      status: 'PROGRAMADA',
    });
    s.clock.current = later(1);
    await s.run.execute();
    const view = await s.myWeek.execute({ viewer: { userId: 11, role: 'EJECUTIVO' } });
    expect(view.items.slice(0, 2).map((i) => [i.companyId, i.reason])).toEqual([
      [appointment, 'SEGUIMIENTO'],
      [followUp, 'SEGUIMIENTO'],
    ]);
    expect(view.items[1]?.nextFollowUpAt).toBe('2026-11-04T16:00:00.000Z');
  });
});

describe('cycle close, release and refill', () => {
  async function toCycleEnd() {
    s.clock.current = later(3); // lunes 16-nov: el ciclo 1 terminó el domingo 15
  }

  test('closes the ended cycle, opens the next one contiguous and counts no-progress', async () => {
    await s.run.execute();
    await toCycleEnd();
    const result = await s.run.execute();
    expect(result.closedCycle).toEqual({
      number: 1,
      evaluated: 180,
      withProgress: 0,
      withoutProgress: 180,
      released: 0,
    });
    expect(result.openedCycle).toBe(2);
    expect(result.week.cycle).toMatchObject({ startDate: '2026-11-16', endDate: '2026-12-06' });
    expect(s.world.active().every((a) => a.cyclesWithoutProgress === 1)).toBe(true);
  });

  test('after MAX cycles without progress the company returns to the pool and goes to another executive', async () => {
    await s.run.execute();
    const progressed = must(s.world.active().find((a) => a.userId === 10)).companyId;
    const looping = must(
      s.world.active().find((a) => a.userId === 10 && a.companyId !== progressed),
    ).companyId;
    await toCycleEnd();
    await s.run.execute(); // cierra ciclo 1 (todas a 1)

    // ciclo 2: una avanza a CON_RESPUESTA, otra solo da vueltas en SIN_RESPUESTA
    s.world.history.push({ companyId: progressed, toStatus: 'CON_RESPUESTA', changedAt: later(4) });
    must(s.world.companies.get(progressed)).status = 'CON_RESPUESTA';
    s.world.history.push({ companyId: looping, toStatus: 'SIN_RESPUESTA', changedAt: later(4) });
    s.world.interactions.push({
      companyId: looping,
      userId: 10,
      occurredAt: later(4),
      nextFollowUpAt: null,
    });

    s.clock.current = later(6); // lunes 7-dic: termina el ciclo 2
    const result = await s.run.execute();
    expect(result.closedCycle).toMatchObject({
      number: 2,
      evaluated: 180,
      withProgress: 1,
      released: 179,
    });
    // rellenado otra vez a 60 cada uno
    expect([...(await s.assignments.countActiveByUser()).values()]).toEqual([60, 60, 60]);

    const prog = must(s.world.active().find((a) => a.companyId === progressed));
    expect(prog).toMatchObject({ userId: 10, cyclesWithoutProgress: 0 });
    const released = must(s.world.assignments.find((a) => a.companyId === looping && a.releasedAt));
    expect(released.releaseReason).toBe('SIN_AVANCE');
    // las recicladas se reparten primero y nunca vuelven a su ejecutivo anterior
    const now = must(s.world.active().find((a) => a.companyId === looping));
    expect(now.userId).not.toBe(10);
    const recycledBackToSameOwner = s.world.active().filter((a) => {
      const prev = s.world.assignments.find(
        (r) => r.companyId === a.companyId && r.releaseReason === 'SIN_AVANCE',
      );
      return prev && prev.userId === a.userId;
    });
    expect(recycledBackToSameOwner).toHaveLength(0);
  });

  test('assignments made during the last week of the cycle are not evaluated', async () => {
    await s.run.execute();
    s.clock.current = later(2); // semana 3
    s.world.addUser(13);
    await s.run.execute(); // el nuevo ejecutivo recibe 60 en la semana 3
    await toCycleEnd();
    const result = await s.run.execute();
    expect(result.closedCycle?.evaluated).toBe(180);
  });

  test('a skipped job (gap) starts the new cycle on the current Monday', async () => {
    await s.run.execute();
    s.clock.current = later(5); // 30-nov
    const result = await s.run.execute();
    expect(result.closedCycle?.number).toBe(1);
    expect(result.week.cycle.startDate).toBe('2026-11-30');
  });

  test('assignments of deactivated executives go back to the pool', async () => {
    await s.run.execute();
    must(s.world.users.find((u) => u.id === 12)).isActive = false;
    s.clock.current = later(1);
    await s.run.execute();
    expect(s.world.active().some((a) => a.userId === 12)).toBe(false);
    expect(
      s.world.assignments.filter(
        (a) => a.userId === 12 && a.releaseReason === 'REASIGNACION_MANUAL',
      ),
    ).toHaveLength(60);
  });
});

describe('pipeline reactions', () => {
  test('interaction with planItemId marks that item; without it, matches the company in that week', async () => {
    await s.run.execute();
    const [first, second] = s.world.items;
    const at = new Date('2026-10-27T15:00:00Z');
    expect(
      await s.markContacted.execute({
        companyId: must(first).companyId,
        planItemId: must(first).id,
        occurredAt: at,
      }),
    ).toBe(1);
    expect(first?.contactedAt).toEqual(at);
    expect(
      await s.markContacted.execute({
        companyId: must(second).companyId,
        planItemId: null,
        occurredAt: at,
      }),
    ).toBe(1);
    expect(second?.contactedAt).toEqual(at);
    // repetir no vuelve a marcar
    expect(
      await s.markContacted.execute({
        companyId: must(first).companyId,
        planItemId: must(first).id,
        occurredAt: later(0.5),
      }),
    ).toBe(0);
    expect(first?.contactedAt).toEqual(at);
  });

  test('a planItemId of another company falls back to the week match; next week does not count', async () => {
    await s.run.execute();
    const [first, second] = s.world.items;
    expect(
      await s.markContacted.execute({
        companyId: must(second).companyId,
        planItemId: must(first).id,
        occurredAt: new Date('2026-10-28T15:00:00Z'),
      }),
    ).toBe(1);
    expect(first?.contactedAt).toBeNull();
    const third = must(s.world.items[2]);
    expect(
      await s.markContacted.execute({
        companyId: third.companyId,
        planItemId: null,
        occurredAt: later(1),
      }),
    ).toBe(0);
  });

  test('Sunday 23:00 Managua still counts for that week', async () => {
    await s.run.execute();
    const item = must(s.world.items[0]);
    await s.markContacted.execute({
      companyId: item.companyId,
      planItemId: null,
      occurredAt: new Date('2026-11-02T05:00:00Z'),
    });
    expect(item.contactedAt).not.toBeNull();
  });

  test('CONTRATO_ACTIVO and DESCARTADO release the assignment with that reason', async () => {
    await s.run.execute();
    const [a, b] = s.world.active();
    expect(
      await s.releaseOnStatus.execute({
        companyId: must(a).companyId,
        to: 'CONTRATO_ACTIVO',
        occurredAt: MONDAY_6AM,
      }),
    ).toBe(1);
    expect(
      await s.releaseOnStatus.execute({
        companyId: must(b).companyId,
        to: 'DESCARTADO',
        occurredAt: MONDAY_6AM,
      }),
    ).toBe(1);
    expect(
      await s.releaseOnStatus.execute({
        companyId: must(b).companyId,
        to: 'CON_RESPUESTA',
        occurredAt: MONDAY_6AM,
      }),
    ).toBe(0);
    const reasons = s.world.assignments
      .filter((x) => x.companyId === must(a).companyId || x.companyId === must(b).companyId)
      .map((x) => x.releaseReason);
    expect(reasons.sort()).toEqual(['CONTRATO_ACTIVO', 'DESCARTADO']);
  });
});

describe('manual assignment', () => {
  test('reassign moves companies between executives with REASIGNACION_MANUAL', async () => {
    await s.run.execute();
    const fromTen = s.world
      .active()
      .filter((a) => a.userId === 10)
      .slice(0, 2)
      .map((a) => a.companyId);
    const pool = 1; // la de menos empleados: queda en el pool
    const result = await s.reassign.execute({
      companyIds: [...fromTen, pool, 9999],
      toUserId: 11,
      actor: SUPERVISOR,
    });
    expect(result.assigned).toEqual([...fromTen, pool]);
    expect(result.released).toHaveLength(2);
    expect(result.skipped).toEqual([9999]);
    for (const id of [...fromTen, pool]) {
      expect(s.world.active().find((a) => a.companyId === id)?.userId).toBe(11);
    }
    // repetir: ya son suyas → skipped
    const again = await s.reassign.execute({ companyIds: fromTen, toUserId: 11, actor: ADMIN });
    expect(again.skipped).toEqual(fromTen);
  });

  test('reassign validates role, target and open cycle', async () => {
    await s.run.execute();
    expect(
      (
        await rejection(
          s.reassign.execute({
            companyIds: [1],
            toUserId: 11,
            actor: { userId: 10, role: 'EJECUTIVO' },
          }),
        )
      ).code,
    ).toBe('PORTFOLIO_FORBIDDEN');
    expect(
      (await rejection(s.reassign.execute({ companyIds: [1], toUserId: 2, actor: ADMIN }))).code,
    ).toBe('PORTFOLIO_TARGET_NOT_EXECUTIVE');
    expect(
      (await rejection(s.reassign.execute({ companyIds: [1], toUserId: 77, actor: ADMIN }))).code,
    ).toBe('PORTFOLIO_USER_NOT_FOUND');
    const empty = build();
    empty.world.addUser(10);
    expect(
      (await rejection(empty.reassign.execute({ companyIds: [1], toUserId: 10, actor: ADMIN })))
        .code,
    ).toBe('PORTFOLIO_NO_ACTIVE_CYCLE');
  });

  test('bulk assign takes pool companies matching filters, more employees first', async () => {
    await s.run.execute();
    must(s.world.companies.get(30)).sectorId = 7;
    must(s.world.companies.get(40)).sectorId = 7;
    must(s.world.companies.get(50)).sectorId = 7;
    const result = await s.bulk.execute({
      filters: { sectorId: 7, minEmployees: 35 },
      toUserId: 12,
      limit: 10,
      actor: SUPERVISOR,
    });
    expect(result.assigned).toEqual([50, 40]);
  });

  test('release returns a company to the pool; twice is an error', async () => {
    await s.run.execute();
    const a = must(s.world.active()[0]);
    await s.release.execute({ assignmentId: a.id as number, actor: ADMIN });
    expect(s.world.assignments.find((x) => x.id === a.id)?.releaseReason).toBe(
      'REASIGNACION_MANUAL',
    );
    expect(
      (await rejection(s.release.execute({ assignmentId: a.id as number, actor: ADMIN }))).code,
    ).toBe('PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED');
    expect((await rejection(s.release.execute({ assignmentId: 1, actor: ADMIN }))).code).toBe(
      'PORTFOLIO_ASSIGNMENT_NOT_FOUND',
    );
  });
});

describe('access policy', () => {
  test('executives only operate their active portfolio; supervisors and admins anything', async () => {
    await s.run.execute();
    const mine = must(s.world.active().find((a) => a.userId === 10)).companyId;
    const other = must(s.world.active().find((a) => a.userId === 11)).companyId;
    const exec = { userId: 10, role: 'EJECUTIVO' as const };
    expect(await s.access.canOperate(exec, mine)).toBe(true);
    expect(await s.access.canOperate(exec, other)).toBe(false);
    expect(await s.access.canOperate(exec, 1)).toBe(false); // del pool
    expect(await s.access.canOperate(SUPERVISOR, other)).toBe(true);
    expect(await s.access.canOperate(ADMIN, 1)).toBe(true);
    await s.releaseOnStatus.execute({ companyId: mine, to: 'DESCARTADO', occurredAt: MONDAY_6AM });
    expect(await s.access.canOperate(exec, mine)).toBe(false);
  });
});

describe('queries', () => {
  test('my-week shows plan progress; executives cannot look at others', async () => {
    await s.run.execute();
    const exec = { userId: 10, role: 'EJECUTIVO' as const };
    const item = must(
      s.world.items.find((i) => s.world.plans.find((p) => p.id === i.planId)?.userId === 10),
    );
    await s.markContacted.execute({
      companyId: item.companyId,
      planItemId: item.id,
      occurredAt: later(0.1),
    });
    const view = await s.myWeek.execute({ viewer: exec });
    expect(view).toMatchObject({ userId: 10, quota: 20, contactedCount: 1, totalItems: 20 });
    expect(view.week?.weekNumber).toBe(1);
    expect(view.items[0]?.priority).toBe(1);
    expect((await rejection(s.myWeek.execute({ viewer: exec, userId: 11 }))).code).toBe(
      'PORTFOLIO_FORBIDDEN',
    );
    expect((await s.myWeek.execute({ viewer: SUPERVISOR, userId: 11 })).userId).toBe(11);
  });

  test('my-week without a cycle is empty', async () => {
    const view = await s.myWeek.execute({ viewer: { userId: 10, role: 'EJECUTIVO' } });
    expect(view).toMatchObject({ week: null, planId: null, items: [], quota: 20 });
  });

  test('current cycle coverage per executive', async () => {
    await s.run.execute();
    const companies = s.world
      .active()
      .filter((a) => a.userId === 10)
      .slice(0, 15);
    for (const a of companies) {
      s.world.interactions.push({
        companyId: a.companyId,
        userId: 10,
        occurredAt: later(0.2),
        nextFollowUpAt: null,
      });
    }
    const dto = await s.currentCycle.execute({ viewer: SUPERVISOR });
    expect(dto.week?.cycle.number).toBe(1);
    expect(dto.executives).toHaveLength(3);
    expect(dto.executives[0]).toMatchObject({
      userId: 10,
      assigned: 60,
      target: 60,
      contactedThisCycle: 15,
      coveragePct: 25,
      plan: { items: 20, contacted: 0, quota: 20 },
    });
    const own = await s.currentCycle.execute({ viewer: { userId: 11, role: 'EJECUTIVO' } });
    expect(own.executives.map((e) => e.userId)).toEqual([11]);
  });

  test('assignment list: executives are forced to their own portfolio', async () => {
    await s.run.execute();
    const page = await s.list.execute({ viewer: SUPERVISOR, query: { page: 1, pageSize: 10 } });
    expect(page.total).toBe(180);
    expect(page.items).toHaveLength(10);
    const own = await s.list.execute({
      viewer: { userId: 12, role: 'EJECUTIVO' },
      query: { page: 1, pageSize: 100 },
    });
    expect(own.total).toBe(60);
    expect(own.items.every((i) => i.userId === 12)).toBe(true);
  });
});
