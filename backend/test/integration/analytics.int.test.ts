import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  CycleCoverageDto,
  ExecutivesDto,
  FunnelDto,
  Paginated,
  SummaryDto,
  WeeklyActivityDto,
} from '@axiom/contracts';
import { bootApp, expectError, type TestApp } from '../support/app';
import { board, interact } from '../support/factories';
import { assignmentsOf, myWeek, resetPortfolio, runWeekly } from '../support/portfolio';

describe('analytics: cifras coherentes con el escenario sembrado', () => {
  let t: TestApp;
  let admin: string;
  let supervisor: string;
  let exec1: { token: string; id: number };
  let exec2: { token: string; id: number };

  const get = async <T>(path: string, token = admin): Promise<T> => {
    const res = await t.api<T>('GET', path, { token });
    if (res.status !== 200)
      throw new Error(`GET ${path}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  beforeAll(async () => {
    t = await bootApp();
    admin = (await t.login('admin')).token;
    supervisor = (await t.login('supervisor')).token;
    const e1 = await t.login('exec1');
    const e2 = await t.login('exec2');
    exec1 = { token: e1.token, id: e1.user.id };
    exec2 = { token: e2.token, id: e2.user.id };
    await resetPortfolio(t);
    expect((await runWeekly(t, admin)).status).toBe(200);
  });
  afterAll(() => t.close());

  test('el embudo (current) coincide con el tablero y con el listado de empresas', async () => {
    const funnel = await get<FunnelDto>('/analytics/funnel');
    const b = await board(t, admin, 1);
    expect(funnel.stages.map((s) => s.status)).toEqual(b.columns.map((c) => c.status));
    for (const stage of funnel.stages) {
      expect(stage.current).toBe(b.columns.find((c) => c.status === stage.status)?.count as number);
    }
    const list = await t.api<Paginated<unknown>>('GET', '/companies?pageSize=1', { token: admin });
    expect(funnel.stages.reduce((n, s) => n + s.current, 0)).toBe(list.body.total);

    const summary = await get<SummaryDto>('/analytics/summary');
    expect(summary.companies.total).toBe(list.body.total);
    const porContactar = funnel.stages.find((s) => s.status === 'POR_CONTACTAR')?.current ?? 0;
    expect(summary.companies.inPipeline).toBe(list.body.total - porContactar);
  });

  test('"alcanzadas" no crece a lo largo del camino principal del embudo', async () => {
    const reached = Object.fromEntries(
      (await get<FunnelDto>('/analytics/funnel')).stages.map((s) => [s.status, s.reached]),
    );
    const path = [
      'POR_CONTACTAR',
      'CONTACTADO',
      'CON_RESPUESTA',
      'AGENDANDO_CITA',
      'EN_PROCESO_CONTRATO',
      'CONTRATO_ACTIVO',
    ];
    for (let i = 1; i < path.length; i++) {
      expect(reached[path[i] as string]).toBeLessThanOrEqual(
        reached[path[i - 1] as string] as number,
      );
    }
  });

  test('registrar 3 contactos nuevos sube los contadores de la semana, del ejecutivo y de la cobertura', async () => {
    const [sBefore, eBefore, cBefore] = await Promise.all([
      get<SummaryDto>('/analytics/summary'),
      get<ExecutivesDto>('/analytics/executives'),
      get<CycleCoverageDto>('/analytics/cycle-coverage'),
    ]);

    const week = await myWeek(t, exec1.token);
    const picks = week.items.slice(0, 3);
    for (const item of picks) {
      const r = await interact(t, exec1.token, item.companyId, {
        outcome: 'NO_CONTESTO',
        planItemId: item.itemId,
      });
      expect(r.status).toBe(201);
    }

    const [sAfter, eAfter, cAfter] = await Promise.all([
      get<SummaryDto>('/analytics/summary'),
      get<ExecutivesDto>('/analytics/executives'),
      get<CycleCoverageDto>('/analytics/cycle-coverage'),
    ]);

    expect(sAfter.contactsThisWeek - sBefore.contactsThisWeek).toBe(3);
    expect(sAfter.weeklyQuota).toMatchObject({
      activeExecutives: 2,
      quotaPerExecutive: 20,
      target: 40,
    });

    const rowOf = (dto: ExecutivesDto, id: number) => dto.executives.find((e) => e.userId === id);
    expect(
      (rowOf(eAfter, exec1.id)?.contactedThisWeek ?? 0) -
        (rowOf(eBefore, exec1.id)?.contactedThisWeek ?? 0),
    ).toBe(3);
    expect(rowOf(eAfter, exec2.id)?.contactedThisWeek).toBe(
      rowOf(eBefore, exec2.id)?.contactedThisWeek as number,
    );
    expect(rowOf(eAfter, exec1.id)).toMatchObject({ assigned: 60, weeklyQuota: 20 });

    expect(cAfter.totals.assigned).toBe(120);
    expect(cAfter.totals.contacted - cBefore.totals.contacted).toBe(3);
    expect(cAfter.totals.pending).toBe(cAfter.totals.assigned - cAfter.totals.contacted);
    expect(cAfter.totals.contacted).toBe(cAfter.executives.reduce((n, e) => n + e.contacted, 0));
    // "contactada en el ciclo" = cualquier interacción del ciclo (ADR 0006), así que cubre al menos
    // los ítems del plan marcados como contactados
    const planContacted = (await myWeek(t, exec1.token)).contactedCount;
    expect(cAfter.executives.find((e) => e.userId === exec1.id)?.contacted).toBeGreaterThanOrEqual(
      planContacted,
    );
  });

  test('actividad semanal: la última semana suma las interacciones registradas', async () => {
    const weekly = await get<WeeklyActivityDto>(
      '/analytics/weekly-activity?weeks=4&byExecutive=true',
    );
    expect(weekly.weeks.length).toBeGreaterThanOrEqual(1);
    const last = weekly.weeks[weekly.weeks.length - 1];
    expect(last).toBeDefined();
    const outcomes = Object.values(last?.byOutcome ?? {}).reduce((a, b) => a + b, 0);
    expect(outcomes).toBe(last?.interactions as number);
    const perExec = (last?.executives ?? []).reduce((a, e) => a + e.interactions, 0);
    expect(perExec).toBe(last?.interactions as number);
  });

  test('un EJECUTIVO solo ve sus propias cifras (ignora el userId pedido)', async () => {
    const mine = await get<ExecutivesDto>(`/analytics/executives?userId=${exec2.id}`, exec1.token);
    expect(mine.executives.map((e) => e.userId)).toEqual([exec1.id]);

    const funnel = await get<FunnelDto>(`/analytics/funnel?userId=${exec2.id}`, exec1.token);
    const assigned = (await assignmentsOf(t, admin, exec1.id)).total;
    expect(funnel.stages.reduce((n, s) => n + s.current, 0)).toBe(assigned);

    // SUPERVISOR puede filtrar por ejecutivo
    const asSup = await get<ExecutivesDto>(`/analytics/executives?userId=${exec2.id}`, supervisor);
    expect(asSup.executives.map((e) => e.userId)).toEqual([exec2.id]);
  });

  test('filtros inválidos → 400 y sin token → 401', async () => {
    expectError(
      await t.api('GET', '/analytics/funnel?from=2026-10-10&to=2026-10-01', { token: admin }),
      400,
    );
    expectError(await t.api('GET', '/analytics/summary?from=ayer', { token: admin }), 400);
    expectError(await t.api('GET', '/analytics/summary'), 401);
  });
});
