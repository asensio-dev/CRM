import { describe, expect, test } from 'bun:test';
import {
  addDays,
  dayStartIso,
  isoToManaguaLocal,
  managuaDay,
  managuaLocalToIso,
  mondayOf,
  weekDays,
  weekRangeIso,
} from './managua-time';

describe('managua-time', () => {
  test('managuaDay usa UTC-6 (21:00 de Managua ya es el día siguiente en UTC)', () => {
    expect(managuaDay(new Date('2026-10-26T03:00:00Z'))).toBe('2026-10-25');
    expect(managuaDay(new Date('2026-10-26T06:00:00Z'))).toBe('2026-10-26');
  });

  test('mondayOf en mitad de semana, domingo y lunes', () => {
    expect(mondayOf('2026-10-21')).toBe('2026-10-19'); // miércoles
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(mondayOf('2026-10-19')).toBe('2026-10-19'); // lunes
  });

  test('la semana cruza fin de mes y de año', () => {
    expect(weekDays('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
    expect(addDays('2026-10-26', 7)).toBe('2026-11-02');
    expect(addDays('2024-02-26', 4)).toBe('2024-03-01');
  });

  test('weekRangeIso es [lunes 00:00, lunes siguiente 00:00) en Managua', () => {
    expect(weekRangeIso('2026-12-28')).toEqual({
      from: '2026-12-28T06:00:00.000Z',
      to: '2027-01-04T06:00:00.000Z',
    });
    expect(dayStartIso('2026-10-25')).toBe('2026-10-25T06:00:00.000Z');
  });

  test('datetime-local ↔ ISO en hora de Managua', () => {
    expect(managuaLocalToIso('2026-10-25T14:30')).toBe('2026-10-25T20:30:00.000Z');
    expect(isoToManaguaLocal('2026-10-25T20:30:00.000Z')).toBe('2026-10-25T14:30');
  });
});
