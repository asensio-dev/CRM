import { describe, expect, test } from 'bun:test';
import {
  addDays,
  diffDays,
  isoWeekStart,
  MANAGUA_OFFSET_MINUTES,
  managuaDay,
  pct,
  periodRange,
  startOfDayUtc,
  weekOf,
  weeksWindow,
} from './time/managua-time';

describe('managua-time', () => {
  test('el desfase fijo coincide con la zona America/Managua', () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Managua',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date('2026-10-24T12:00:00Z'));
    expect(Number(parts)).toBe(12 + MANAGUA_OFFSET_MINUTES / 60);
  });

  test('managuaDay respeta el cambio de día a las 06:00 UTC', () => {
    expect(managuaDay(new Date('2026-10-26T05:59:59Z'))).toBe('2026-10-25');
    expect(managuaDay(new Date('2026-10-26T06:00:00Z'))).toBe('2026-10-26');
    expect(startOfDayUtc('2026-10-26').toISOString()).toBe('2026-10-26T06:00:00.000Z');
  });

  test('la semana ISO empieza el lunes y el domingo de noche aún es la misma semana', () => {
    expect(isoWeekStart('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(isoWeekStart('2026-10-19')).toBe('2026-10-19');
    // Lunes 26 02:00 UTC = domingo 25 20:00 en Managua → semana del 19
    const w = weekOf(new Date('2026-10-26T02:00:00Z'));
    expect(w.startDay).toBe('2026-10-19');
    expect(w.endDay).toBe('2026-10-25');
    expect(w.startUtc.toISOString()).toBe('2026-10-19T06:00:00.000Z');
    expect(w.endUtc.toISOString()).toBe('2026-10-26T06:00:00.000Z');
    expect(weekOf(new Date('2026-10-26T06:00:00Z')).startDay).toBe('2026-10-26');
  });

  test('addDays / diffDays cruzan meses y años', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-10-01', '2026-10-22')).toBe(21);
  });

  test('periodRange: to es inclusivo', () => {
    const r = periodRange('2026-10-01', '2026-10-31');
    expect(r.from?.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(r.to?.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(periodRange()).toEqual({ from: null, to: null });
  });

  test('weeksWindow devuelve N lunes consecutivos que terminan en la semana actual', () => {
    const w = weeksWindow(new Date('2026-10-24T15:00:00Z'), 3);
    expect(w.weekStarts).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(w.anchorDay).toBe('2026-10-05');
    expect(w.range.to.toISOString()).toBe('2026-10-26T06:00:00.000Z');
  });

  test('weeksWindow se recorta con from y termina en la semana de to', () => {
    const w = weeksWindow(new Date('2026-10-24T15:00:00Z'), 12, '2026-10-14', '2026-10-15');
    expect(w.weekStarts).toEqual(['2026-10-12']);
    expect(w.range.from.toISOString()).toBe('2026-10-14T06:00:00.000Z');
    expect(w.range.to.toISOString()).toBe('2026-10-16T06:00:00.000Z');
  });

  test('pct redondea a un decimal y devuelve null sin denominador', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(5, 0)).toBeNull();
    expect(pct(25, 20)).toBe(125);
  });
});
