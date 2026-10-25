import { describe, expect, test } from 'bun:test';
import { DefaultPoolSelectionStrategy, type PoolCandidate } from './pool-selection-strategy';
import { DefaultPrioritizationStrategy, type PlanCandidate } from './prioritization-strategy';
import { madeProgress } from './progress-policy';

const d = (iso: string) => new Date(iso);
const cand = (companyId: number, over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  companyId,
  status: 'POR_CONTACTAR',
  employeeCount: 0,
  lastContactAt: null,
  followUpAt: null,
  contactedThisCycle: false,
  ...over,
});
const ctx = { quota: 3, weekNumber: 1, totalWeeks: 3 };
const strategy = new DefaultPrioritizationStrategy();

describe('DefaultPrioritizationStrategy', () => {
  test('order: SEGUIMIENTO → NUEVA → REINTENTO → ROTACION', () => {
    const items = strategy.prioritize(
      [
        cand(1, { status: 'CON_RESPUESTA', lastContactAt: d('2026-10-01') }),
        cand(2, { status: 'SIN_RESPUESTA', lastContactAt: d('2026-10-10') }),
        cand(3),
        cand(4, { status: 'AGENDANDO_CITA', followUpAt: d('2026-10-28T15:00:00Z') }),
      ],
      { ...ctx, quota: 4 },
    );
    expect(items).toEqual([
      { companyId: 4, reason: 'SEGUIMIENTO', priority: 1 },
      { companyId: 3, reason: 'NUEVA', priority: 2 },
      { companyId: 2, reason: 'REINTENTO', priority: 3 },
      { companyId: 1, reason: 'ROTACION', priority: 4 },
    ]);
  });

  test('within categories: NUEVA by employees, REINTENTO by oldest attempt, ROTACION by last contact then employees', () => {
    const items = strategy.prioritize(
      [
        cand(1, { employeeCount: 5 }),
        cand(2, { employeeCount: 50 }),
        cand(3, { status: 'SIN_RESPUESTA', lastContactAt: d('2026-10-20') }),
        cand(4, { status: 'SIN_RESPUESTA', lastContactAt: d('2026-09-20') }),
        cand(5, { status: 'CONTACTADO', lastContactAt: d('2026-10-01'), employeeCount: 1 }),
        cand(6, { status: 'CONTACTADO', lastContactAt: d('2026-10-01'), employeeCount: 9 }),
        cand(7, { status: 'CONTACTADO', lastContactAt: d('2026-08-01') }),
      ],
      { ...ctx, quota: 7 },
    );
    expect(items.map((i) => i.companyId)).toEqual([2, 1, 4, 3, 7, 6, 5]);
  });

  test('companies not contacted this cycle go first (coverage)', () => {
    const items = strategy.prioritize(
      [
        cand(1, { contactedThisCycle: true }), // NUEVA pero ya tocada en el ciclo… (caso raro)
        cand(2, { status: 'CON_RESPUESTA', lastContactAt: d('2026-10-01') }),
        cand(3, {
          status: 'SIN_RESPUESTA',
          lastContactAt: d('2026-10-02'),
          contactedThisCycle: true,
        }),
      ],
      { ...ctx, quota: 1 },
    );
    expect(items).toEqual([{ companyId: 2, reason: 'ROTACION', priority: 1 }]);
  });

  test('follow-ups are always included even above quota, sorted by date', () => {
    const items = strategy.prioritize(
      [
        cand(1, { followUpAt: d('2026-10-30T00:00:00Z') }),
        cand(2, { followUpAt: d('2026-10-27T00:00:00Z'), contactedThisCycle: true }),
        cand(3),
      ],
      { ...ctx, quota: 1 },
    );
    expect(items.map((i) => [i.companyId, i.reason])).toEqual([
      [2, 'SEGUIMIENTO'],
      [1, 'SEGUIMIENTO'],
    ]);
  });

  test('plan size grows to cover pending companies in the remaining weeks', () => {
    const portfolio = Array.from({ length: 60 }, (_, i) => cand(i + 1));
    // semana 1: 60 pendientes / 3 semanas = 20
    expect(
      strategy.prioritize(portfolio, { quota: 20, weekNumber: 1, totalWeeks: 3 }),
    ).toHaveLength(20);
    // semana 3 con 45 aún sin contactar → los 45 entran
    const late = portfolio.map((c, i) => ({ ...c, contactedThisCycle: i < 15 }));
    expect(strategy.prioritize(late, { quota: 20, weekNumber: 3, totalWeeks: 3 })).toHaveLength(45);
    // semana 2 con 50 pendientes → ⌈50/2⌉ = 25
    const mid = portfolio.map((c, i) => ({ ...c, contactedThisCycle: i < 10 }));
    expect(strategy.prioritize(mid, { quota: 20, weekNumber: 2, totalWeeks: 3 })).toHaveLength(25);
  });

  test('never exceeds the portfolio and excludes companies out of rotation', () => {
    const items = strategy.prioritize(
      [cand(1), cand(2, { status: 'CONTRATO_ACTIVO' }), cand(3, { status: 'DESCARTADO' })],
      { quota: 20, weekNumber: 1, totalWeeks: 3 },
    );
    expect(items.map((i) => i.companyId)).toEqual([1]);
  });
});

const pool = (companyId: number, over: Partial<PoolCandidate> = {}): PoolCandidate => ({
  companyId,
  employeeCount: 0,
  sectorId: null,
  previousOwnerId: null,
  recycled: false,
  ...over,
});

describe('DefaultPoolSelectionStrategy', () => {
  const s = new DefaultPoolSelectionStrategy();

  test('round-robin by biggest deficit, best companies spread out', () => {
    const result = s.distribute(
      [
        pool(1, { employeeCount: 100 }),
        pool(2, { employeeCount: 90 }),
        pool(3, { employeeCount: 80 }),
        pool(4, { employeeCount: 70 }),
      ],
      [
        { userId: 10, count: 2 },
        { userId: 20, count: 2 },
      ],
    );
    expect(result.get(10)).toEqual([1, 3]);
    expect(result.get(20)).toEqual([2, 4]);
  });

  test('recycled companies first, never back to their previous owner when avoidable', () => {
    const result = s.distribute(
      [
        pool(1, { employeeCount: 1000 }),
        pool(2, { recycled: true, previousOwnerId: 10 }),
        pool(3, { recycled: true, previousOwnerId: 20 }),
      ],
      [
        { userId: 10, count: 1 },
        { userId: 20, count: 1 },
      ],
    );
    expect(result.get(10)).toEqual([3]);
    expect(result.get(20)).toEqual([2]);
  });

  test('falls back to a previous owner only when nothing else is left', () => {
    const result = s.distribute(
      [pool(2, { recycled: true, previousOwnerId: 10 })],
      [{ userId: 10, count: 3 }],
    );
    expect(result.get(10)).toEqual([2]);
  });

  test('ignores satisfied demands and duplicate candidates; shortfall when pool is small', () => {
    const result = s.distribute(
      [pool(1), pool(1), pool(2)],
      [
        { userId: 10, count: 0 },
        { userId: 20, count: 5 },
      ],
    );
    expect(result.has(10)).toBe(false);
    expect(result.get(20)).toEqual([1, 2]);
  });
});

describe('progress policy', () => {
  const ev = (over = {}) => ({
    companyId: 1,
    currentStatus: 'SIN_RESPUESTA',
    advancedTransitions: 0,
    interactions: 0,
    ...over,
  });

  test('contact loop (CONTACTADO ⇄ SIN_RESPUESTA) is not progress', () => {
    expect(madeProgress(ev({ interactions: 5 }))).toBe(false);
    expect(madeProgress(ev({ currentStatus: 'CONTACTADO', interactions: 2 }))).toBe(false);
    expect(madeProgress(undefined)).toBe(false);
  });

  test('a transition to CON_RESPUESTA or beyond within the cycle is progress', () => {
    expect(madeProgress(ev({ advancedTransitions: 1 }))).toBe(true);
  });

  test('an advanced company with activity in the cycle is progress; idle is not', () => {
    expect(madeProgress(ev({ currentStatus: 'EN_PROCESO_CONTRATO', interactions: 1 }))).toBe(true);
    expect(madeProgress(ev({ currentStatus: 'EN_PROCESO_CONTRATO', interactions: 0 }))).toBe(false);
  });
});
