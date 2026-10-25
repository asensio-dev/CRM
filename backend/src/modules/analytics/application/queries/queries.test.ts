import { describe, expect, test } from 'bun:test';
import { FakeAnalyticsReader } from '../../testing/fake-analytics-reader';
import { resolveScope } from '../scope';
import { toCycleInfo } from './cycle';
import { GetCycleCoverageQuery } from './cycle-coverage.query';
import { GetExecutivesQuery } from './executives.query';
import { GetFunnelQuery } from './funnel.query';
import { GetSummaryQuery } from './summary.query';
import { GetWeeklyActivityQuery } from './weekly-activity.query';

const NOW = new Date('2026-10-24T15:00:00Z'); // sábado en Managua
const clock = { now: () => NOW };
const admin = { userId: 1, role: 'ADMIN' as const };
const exec = { userId: 7, role: 'EJECUTIVO' as const };

describe('resolveScope', () => {
  test('EJECUTIVO queda forzado a sí mismo aunque pida otro userId', () => {
    expect(resolveScope(exec, { userId: 8, sectorId: 3 })).toEqual({ userId: 7, sectorId: 3 });
  });
  test('ADMIN/SUPERVISOR usan el filtro pedido', () => {
    expect(resolveScope(admin, { userId: 8 }).userId).toBe(8);
    expect(resolveScope({ userId: 2, role: 'SUPERVISOR' }, {}).userId).toBeUndefined();
  });
});

describe('GetSummaryQuery', () => {
  test('mapea KPIs, cuota y conversión', async () => {
    const r = new FakeAnalyticsReader();
    const dto = await new GetSummaryQuery(r, clock).execute(admin, {});
    expect(dto.week).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(dto.companies).toEqual({ total: 100, inPipeline: 10 });
    expect(dto.weeklyQuota).toEqual({
      activeExecutives: 2,
      quotaPerExecutive: 20,
      target: 40,
      compliancePct: 50,
    });
    expect(dto.contractsActive.count).toBe(3);
    expect(dto.conversion).toEqual({ contacted: 10, contracted: 1, ratePct: 10 });
  });

  test('sin ejecutivos ni contactados los porcentajes son null', async () => {
    const r = new FakeAnalyticsReader();
    r.executives = [];
    r.reached = {};
    const dto = await new GetSummaryQuery(r, clock).execute(admin, {});
    expect(dto.weeklyQuota.compliancePct).toBeNull();
    expect(dto.conversion.ratePct).toBeNull();
  });

  test('EJECUTIVO: todas las lecturas se hacen con su userId', async () => {
    const r = new FakeAnalyticsReader();
    await new GetSummaryQuery(r, clock).execute(exec, { userId: 8 });
    expect(r.scopes.length).toBeGreaterThan(0);
    expect(r.scopes.every((s) => s.userId === 7)).toBe(true);
  });
});

describe('GetFunnelQuery', () => {
  test('etapas en orden de PIPELINE_STATUSES con conversión sobre el camino principal', async () => {
    const dto = await new GetFunnelQuery(new FakeAnalyticsReader()).execute(admin, {
      from: '2026-09-01',
    });
    expect(dto.stages.map((s) => s.status)[0]).toBe('POR_CONTACTAR');
    expect(dto.stages).toHaveLength(8);
    const by = Object.fromEntries(dto.stages.map((s) => [s.status, s]));
    expect(by.POR_CONTACTAR?.reached).toBe(100);
    expect(by.CONTACTADO?.conversionPct).toBe(10);
    expect(by.CON_RESPUESTA?.conversionPct).toBe(50);
    expect(by.SIN_RESPUESTA?.conversionPct).toBeNull();
    expect(by.DESCARTADO?.conversionPct).toBeNull();
    expect(by.CONTRATO_ACTIVO?.current).toBe(2);
    expect(dto.period).toEqual({ from: '2026-09-01', to: null });
  });

  test('la conversión se topa en 100 %', async () => {
    const r = new FakeAnalyticsReader();
    r.reached = { CONTACTADO: 2, CON_RESPUESTA: 5 };
    const dto = await new GetFunnelQuery(r).execute(admin, {});
    expect(dto.stages.find((s) => s.status === 'CON_RESPUESTA')?.conversionPct).toBe(100);
  });
});

describe('GetWeeklyActivityQuery', () => {
  test('rellena semanas vacías y acumula por resultado', async () => {
    const r = new FakeAnalyticsReader();
    r.weekly = {
      outcomes: [
        { week: 2, outcome: 'CONTESTO', count: 5 },
        { week: 2, outcome: 'NO_CONTESTO', count: 3 },
      ],
      companies: [{ week: 2, count: 6 }],
      executives: [{ week: 2, userId: 7, fullName: 'Ana Pérez', interactions: 8, companies: 6 }],
    };
    const dto = await new GetWeeklyActivityQuery(r, clock).execute(admin, {
      weeks: 3,
      byExecutive: true,
    });
    expect(dto.weeks.map((w) => w.weekStart)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(dto.weeks[0]?.interactions).toBe(0);
    expect(dto.weeks[2]?.interactions).toBe(8);
    expect(dto.weeks[2]?.byOutcome.CONTESTO).toBe(5);
    expect(dto.weeks[2]?.companiesContacted).toBe(6);
    expect(dto.weeks[2]?.executives?.[0]?.fullName).toBe('Ana Pérez');
  });

  test('sin byExecutive no incluye el desglose', async () => {
    const dto = await new GetWeeklyActivityQuery(new FakeAnalyticsReader(), clock).execute(admin, {
      weeks: 1,
      byExecutive: false,
    });
    expect(dto.weeks[0]).not.toHaveProperty('executives');
  });
});

const CYCLE = { id: 1, number: 1, startDay: '2026-10-12', endDay: '2026-11-01' };

describe('ciclo', () => {
  test('semana k de N según las fechas', () => {
    expect(toCycleInfo(CYCLE, NOW)).toMatchObject({ weekNumber: 2, totalWeeks: 3 });
    expect(toCycleInfo(CYCLE, new Date('2026-10-12T07:00:00Z')).weekNumber).toBe(1);
    expect(toCycleInfo(CYCLE, new Date('2026-12-01T00:00:00Z')).weekNumber).toBe(3);
  });
});

describe('GetExecutivesQuery', () => {
  test('sin ciclo ni cartera devuelve ceros sin fallar', async () => {
    const r = new FakeAnalyticsReader();
    r.metrics = {
      assigned: new Map(),
      contactedWeek: new Map(),
      contactedCycle: new Map(),
      advancesWeek: new Map(),
      appointmentsWeek: new Map(),
      contractsActive: new Map(),
    };
    const dto = await new GetExecutivesQuery(r, clock).execute(admin, {});
    expect(dto.cycle).toBeNull();
    expect(dto.executives).toHaveLength(2);
    expect(dto.executives[0]).toMatchObject({
      assigned: 0,
      contactedThisWeek: 0,
      contactedThisCycle: 0,
      cycleCoveragePct: null,
    });
  });

  test('calcula cuota y cobertura de ciclo', async () => {
    const r = new FakeAnalyticsReader();
    r.cycle = CYCLE;
    const dto = await new GetExecutivesQuery(r, clock).execute(admin, {});
    expect(dto.cycle?.weekNumber).toBe(2);
    expect(dto.executives[0]).toMatchObject({
      userId: 7,
      assigned: 40,
      contactedThisWeek: 10,
      quotaPct: 50,
      cycleCoveragePct: 25,
      statusAdvancesThisWeek: 2,
      contractsActive: 1,
    });
  });

  test('EJECUTIVO solo ve su fila', async () => {
    const r = new FakeAnalyticsReader();
    const dto = await new GetExecutivesQuery(r, clock).execute(
      { userId: 8, role: 'EJECUTIVO' },
      {
        userId: 7,
      },
    );
    expect(dto.executives.map((e) => e.userId)).toEqual([8]);
  });
});

describe('GetCycleCoverageQuery', () => {
  test('sin ciclo: null y totales en cero', async () => {
    const dto = await new GetCycleCoverageQuery(new FakeAnalyticsReader(), clock).execute(
      admin,
      {},
    );
    expect(dto.cycle).toBeNull();
    expect(dto.totals).toEqual({ assigned: 0, contacted: 0, pending: 0, coveragePct: null });
  });

  test('pendientes = asignadas - contactadas', async () => {
    const r = new FakeAnalyticsReader();
    r.cycle = CYCLE;
    const dto = await new GetCycleCoverageQuery(r, clock).execute(admin, {});
    expect(dto.cycle).toMatchObject({ weekNumber: 2, totalWeeks: 3 });
    expect(dto.executives[0]).toMatchObject({
      assigned: 40,
      contacted: 10,
      pending: 30,
      coveragePct: 25,
    });
    expect(dto.totals).toEqual({ assigned: 40, contacted: 10, pending: 30, coveragePct: 25 });
  });
});
