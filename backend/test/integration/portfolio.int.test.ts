import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PipelineStateDto } from '@axiom/contracts';
import { bootApp, expectError, type TestApp } from '../support/app';
import { createCompany, interact, pipelineState } from '../support/factories';
import {
  assignmentsOf,
  currentCycle,
  myWeek,
  resetPortfolio,
  runWeekly,
} from '../support/portfolio';

describe('portfolio (cartera rotativa)', () => {
  let t: TestApp;
  let admin: string;
  let supervisor: string;
  let exec1: { token: string; id: number };
  let exec2: { token: string; id: number };
  let firstRun: Awaited<ReturnType<typeof runWeekly>>;

  beforeAll(async () => {
    t = await bootApp();
    admin = (await t.login('admin')).token;
    supervisor = (await t.login('supervisor')).token;
    const e1 = await t.login('exec1');
    const e2 = await t.login('exec2');
    exec1 = { token: e1.token, id: e1.user.id };
    exec2 = { token: e2.token, id: e2.user.id };
    await resetPortfolio(t);
    firstRun = await runWeekly(t, admin);
  });
  afterAll(() => t.close());

  test('run-weekly: abre el ciclo, llena las carteras al objetivo y genera los planes', async () => {
    expect(firstRun.status).toBe(200);
    const r = firstRun.body;
    expect(r.openedCycle).toBe(1);
    expect(r.closedCycle).toBeNull();
    expect(r.refill).toEqual({ executives: 2, assigned: 120, shortfall: 0 });
    expect(r.plans.generated).toBe(2);
    expect(r.plans.items).toBeGreaterThanOrEqual(40);
    expect(r.week.totalWeeks).toBe(3);
    expect(r.week.weekNumber).toBe(1);

    for (const e of [exec1, exec2]) {
      const mine = await assignmentsOf(t, admin, e.id);
      expect(mine.total).toBe(60);
    }
  });

  test('las carteras no comparten empresas y excluyen empresas sin teléfono', async () => {
    const a = await assignmentsOf(t, admin, exec1.id);
    const b = await assignmentsOf(t, admin, exec2.id);
    const ids = [...a.items, ...b.items].map((x) => x.companyId);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...a.items, ...b.items].every((x) => x.phone !== null && x.phone !== '')).toBe(true);
  });

  test('plan semanal: ≥ cuota (20) ítems por ejecutivo, todos de su cartera', async () => {
    for (const e of [exec1, exec2]) {
      const week = await myWeek(t, e.token);
      expect(week.quota).toBe(20);
      expect(week.totalItems).toBeGreaterThanOrEqual(20);
      expect(week.items.length).toBe(week.totalItems);
      expect(week.contactedCount).toBe(0);
      const owned = new Set((await assignmentsOf(t, admin, e.id)).items.map((x) => x.companyId));
      expect(week.items.every((i) => owned.has(i.companyId))).toBe(true);
    }
  });

  test('cycles/current resume la cobertura por ejecutivo', async () => {
    const cycle = await currentCycle(t, admin);
    expect(cycle.week?.cycle.number).toBe(1);
    expect(cycle.executives.map((x) => x.userId).sort()).toEqual([exec1.id, exec2.id].sort());
    for (const x of cycle.executives) {
      expect(x.assigned).toBe(60);
      expect(x.target).toBe(60);
      expect(x.plan?.items).toBeGreaterThanOrEqual(20);
    }
  });

  test('segunda ejecución de run-weekly es idempotente (sin cambios)', async () => {
    const again = await runWeekly(t, admin);
    expect(again.status).toBe(200);
    expect(again.body.openedCycle).toBeNull();
    expect(again.body.closedCycle).toBeNull();
    expect(again.body.refill.assigned).toBe(0);
    expect(again.body.plans.generated).toBe(0);
    expect(again.body.plans.existing).toBe(2);
    expect((await assignmentsOf(t, admin, exec1.id)).total).toBe(60);
  });

  test('dos run-weekly simultáneos no duplican carteras ni planes', async () => {
    const [a, b] = await Promise.all([runWeekly(t, admin), runWeekly(t, admin)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await assignmentsOf(t, admin, exec1.id)).total).toBe(60);
    const plans = await t.prisma.client.weeklyPlan.count();
    expect(plans).toBe(2);
  });

  test('solo ADMIN corre la rotación; EJECUTIVO no ve la semana de otro; SUPERVISOR sí', async () => {
    expectError(await runWeekly(t, supervisor), 403);
    expectError(await runWeekly(t, exec1.token), 403);
    expectError(
      await t.api('GET', `/portfolio/my-week?userId=${exec2.id}`, { token: exec1.token }),
      403,
    );
    const asSupervisor = await myWeek(t, supervisor, exec2.id);
    expect(asSupervisor.userId).toBe(exec2.id);
  });

  test('política de acceso: operar una empresa de otro ejecutivo (o sin dueño) → 403 PORTFOLIO_COMPANY_NOT_ASSIGNED', async () => {
    const theirs = (await assignmentsOf(t, admin, exec2.id)).items[0];
    expect(theirs).toBeDefined();
    const res = await interact(t, exec1.token, theirs?.companyId as number);
    expectError(res, 403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED');
    const status = await t.api('POST', `/pipeline/companies/${theirs?.companyId}/status`, {
      token: exec1.token,
      body: { to: 'CONTACTADO' },
    });
    expectError(status, 403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED');

    const orphan = await createCompany(t, admin);
    expectError(await interact(t, exec1.token, orphan.id), 403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED');
    // ADMIN y SUPERVISOR operan cualquier empresa
    expect((await interact(t, supervisor, orphan.id)).status).toBe(201);
  });

  test('una interacción marca el ítem del plan como contactado (con planItemId y por empresa)', async () => {
    const before = await myWeek(t, exec1.token);
    const [first, second] = before.items;
    expect(first?.contactedAt).toBeNull();

    const withItem = await interact(t, exec1.token, first?.companyId as number, {
      outcome: 'NO_CONTESTO',
      planItemId: first?.itemId,
    });
    expect(withItem.status).toBe(201);

    // sin planItemId: se marca por empresa dentro de la semana
    const byCompany = await interact(t, exec1.token, second?.companyId as number, {
      outcome: 'NO_CONTESTO',
    });
    expect(byCompany.status).toBe(201);

    const after = await myWeek(t, exec1.token);
    expect(after.contactedCount).toBe(2);
    const contacted = after.items.filter((i) => i.contactedAt !== null).map((i) => i.itemId);
    expect(contacted.sort()).toEqual([first?.itemId as number, second?.itemId as number].sort());

    // marcarlo solo la primera vez: otra interacción no cambia el conteo
    await interact(t, exec1.token, first?.companyId as number, { outcome: 'NO_CONTESTO' });
    expect((await myWeek(t, exec1.token)).contactedCount).toBe(2);

    // y se refleja en la cobertura del ciclo
    const cover = (await currentCycle(t, admin)).executives.find((x) => x.userId === exec1.id);
    expect(cover?.plan?.contacted).toBe(2);
    expect(cover?.contactedThisCycle).toBeGreaterThanOrEqual(2);
  });

  test('CONTRATO_ACTIVO libera la asignación; run-weekly rellena el hueco', async () => {
    const mine = await assignmentsOf(t, admin, exec1.id);
    const target = mine.items[mine.items.length - 1];
    const companyId = target?.companyId as number;

    const step = async (to: string): Promise<PipelineStateDto> => {
      const res = await t.api<PipelineStateDto>('POST', `/pipeline/companies/${companyId}/status`, {
        token: exec1.token,
        body: { to },
      });
      if (res.status !== 200) throw new Error(`${to}: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body;
    };
    await interact(t, exec1.token, companyId, { outcome: 'INTERESADO' });
    await step('AGENDANDO_CITA');
    await step('EN_PROCESO_CONTRATO');
    expect((await assignmentsOf(t, admin, exec1.id)).total).toBe(60); // aún activa
    await step('CONTRATO_ACTIVO');

    const after = await assignmentsOf(t, admin, exec1.id);
    expect(after.total).toBe(59);
    expect(after.items.map((x) => x.companyId)).not.toContain(companyId);
    const row = await t.prisma.client.portfolioAssignment.findFirst({
      where: { companyId, releasedAt: { not: null } },
    });
    expect(row?.releaseReason).toBe('CONTRATO_ACTIVO');
    expect((await pipelineState(t, admin, companyId)).status).toBe('CONTRATO_ACTIVO');

    // Tras liberar, la siguiente rotación rellena y la empresa con contrato no vuelve al pool
    const refill = await runWeekly(t, admin);
    expect(refill.body.refill.assigned).toBe(1);
    const refilled = await assignmentsOf(t, admin, exec1.id);
    expect(refilled.total).toBe(60);
    expect(refilled.items.map((x) => x.companyId)).not.toContain(companyId);
  });

  test('reasignación manual (SUPERVISOR) mueve la empresa; EJECUTIVO no puede', async () => {
    const moved = (await assignmentsOf(t, admin, exec1.id)).items[0]?.companyId as number;
    expectError(
      await t.api('POST', '/portfolio/assignments/reassign', {
        token: exec1.token,
        body: { companyIds: [moved], toUserId: exec2.id },
      }),
      403,
    );
    const res = await t.api<{ assigned: number[]; released: number[] }>(
      'POST',
      '/portfolio/assignments/reassign',
      { token: supervisor, body: { companyIds: [moved], toUserId: exec2.id } },
    );
    expect(res.status).toBe(200);
    expect(res.body.assigned).toEqual([moved]);
    expect((await assignmentsOf(t, admin, exec2.id)).items.map((x) => x.companyId)).toContain(
      moved,
    );
    expect((await assignmentsOf(t, admin, exec1.id)).items.map((x) => x.companyId)).not.toContain(
      moved,
    );
    // ahora exec2 puede operarla y exec1 no
    expect((await interact(t, exec2.token, moved)).status).toBe(201);
    expectError(await interact(t, exec1.token, moved), 403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED');
  });
});
