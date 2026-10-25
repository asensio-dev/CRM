import { describe, expect, test } from 'bun:test';
import { DomainError } from '../../../../shared/domain';
import { parsePortfolioSettings } from '../portfolio-settings';
import { PortfolioAssignment } from './portfolio-assignment';
import { RotationCycle } from './rotation-cycle';
import { WeeklyPlan } from './weekly-plan';

const at = new Date('2026-11-16T12:00:00Z');

describe('RotationCycle', () => {
  test('first cycle starts on the Monday of the current week and lasts N weeks', () => {
    const c = RotationCycle.openNext(null, '2026-10-29', 3); // jueves
    expect(c.number).toBe(1);
    expect(c.startDate).toBe('2026-10-26');
    expect(c.endDate).toBe('2026-11-15'); // domingo
    expect(c.totalWeeks).toBe(3);
    expect(c.lastWeekStart).toBe('2026-11-09');
  });

  test('next cycle is contiguous to the previous one', () => {
    const first = RotationCycle.openNext(null, '2026-10-26', 3);
    const second = RotationCycle.openNext(first, '2026-11-16', 3);
    expect(second.number).toBe(2);
    expect(second.startDate).toBe('2026-11-16');
    expect(second.endDate).toBe('2026-12-06');
  });

  test('after a gap (job did not run) the new cycle starts this Monday', () => {
    const first = RotationCycle.openNext(null, '2026-10-26', 3);
    const late = RotationCycle.openNext(first, '2026-12-10', 3);
    expect(late.startDate).toBe('2026-12-07');
    expect(late.number).toBe(2);
  });

  test('cycle crossing new year: week numbers and end detection', () => {
    const c = RotationCycle.openNext(null, '2026-12-21', 3);
    expect(c.endDate).toBe('2027-01-10');
    expect(c.weekNumberOf('2026-12-21')).toBe(1);
    expect(c.weekNumberOf('2026-12-27')).toBe(1);
    expect(c.weekNumberOf('2026-12-28')).toBe(2);
    expect(c.weekNumberOf('2027-01-01')).toBe(2);
    expect(c.weekNumberOf('2027-01-04')).toBe(3);
    expect(c.weekNumberOf('2027-01-10')).toBe(3);
    expect(c.weekNumberOf('2027-02-01')).toBe(3); // acotado
    expect(c.weekNumberOf('2026-12-01')).toBe(1);
    expect(c.weekStart(2)).toBe('2026-12-28');
    expect(c.hasEndedBy('2027-01-10')).toBe(false);
    expect(c.hasEndedBy('2027-01-11')).toBe(true);
    expect(c.contains('2027-01-10')).toBe(true);
  });

  test('closing is idempotent', () => {
    const c = RotationCycle.openNext(null, '2026-10-26', 3);
    c.close(at);
    c.close(new Date());
    expect(c.closedAt).toEqual(at);
  });

  test('rejects invalid cycle length', () => {
    expect(() => RotationCycle.openNext(null, '2026-10-26', 0)).toThrow(DomainError);
  });
});

describe('PortfolioAssignment', () => {
  const fresh = () => PortfolioAssignment.assign({ companyId: 1, userId: 2, cycleId: 3, at });

  test('progress resets the counter; no progress counts consecutive cycles', () => {
    const a = fresh();
    expect(a.recordCycleOutcome(false, 2, at)).toBe('NO_PROGRESS');
    expect(a.cyclesWithoutProgress).toBe(1);
    expect(a.recordCycleOutcome(true, 2, at)).toBe('PROGRESS');
    expect(a.cyclesWithoutProgress).toBe(0);
    expect(a.isActive).toBe(true);
  });

  test('reaching MAX_CYCLES_WITHOUT_PROGRESS releases with SIN_AVANCE', () => {
    const a = fresh();
    a.recordCycleOutcome(false, 2, at);
    expect(a.recordCycleOutcome(false, 2, at)).toBe('RELEASED');
    expect(a.isActive).toBe(false);
    expect(a.releaseReason).toBe('SIN_AVANCE');
    expect(a.releasedAt).toEqual(at);
  });

  test('max = 1 releases after the first empty cycle', () => {
    expect(fresh().recordCycleOutcome(false, 1, at)).toBe('RELEASED');
  });

  test('cannot release twice', () => {
    const a = fresh();
    a.release('REASIGNACION_MANUAL', at);
    expect(() => a.release('DESCARTADO', at)).toThrow(DomainError);
    expect(() => a.recordCycleOutcome(true, 2, at)).toThrow(DomainError);
  });
});

describe('WeeklyPlan', () => {
  const base = { userId: 1, cycleId: 1, weekNumber: 1, quota: 20 };
  test('requires a Monday and unique companies', () => {
    expect(() => WeeklyPlan.generate({ ...base, weekStart: '2026-10-27', items: [] })).toThrow(
      DomainError,
    );
    expect(() =>
      WeeklyPlan.generate({
        ...base,
        weekStart: '2026-10-26',
        items: [
          { companyId: 1, reason: 'NUEVA', priority: 1 },
          { companyId: 1, reason: 'NUEVA', priority: 2 },
        ],
      }),
    ).toThrow(DomainError);
    expect(WeeklyPlan.generate({ ...base, weekStart: '2026-10-26', items: [] }).weekStart).toBe(
      '2026-10-26',
    );
  });
});

describe('parsePortfolioSettings', () => {
  test('defaults: 3 weeks × 20 = 60, Managua', () => {
    expect(parsePortfolioSettings({}).settings).toEqual({
      cycleWeeks: 3,
      weeklyQuota: 20,
      maxCyclesWithoutProgress: 2,
      timezone: 'America/Managua',
      portfolioSize: 60,
    });
  });

  test('reads values and falls back on invalid ones', () => {
    const parsed = parsePortfolioSettings({
      ROTATION_CYCLE_WEEKS: '4',
      WEEKLY_CONTACT_QUOTA: 'veinte',
      MAX_CYCLES_WITHOUT_PROGRESS: '0',
      TIMEZONE: 'Nowhere/City',
    });
    expect(parsed.settings.cycleWeeks).toBe(4);
    expect(parsed.settings.weeklyQuota).toBe(20);
    expect(parsed.settings.maxCyclesWithoutProgress).toBe(2);
    expect(parsed.settings.timezone).toBe('America/Managua');
    expect(parsed.settings.portfolioSize).toBe(80);
    expect(parsed.invalid.sort()).toEqual([
      'MAX_CYCLES_WITHOUT_PROGRESS',
      'TIMEZONE',
      'WEEKLY_CONTACT_QUOTA',
    ]);
  });
});
