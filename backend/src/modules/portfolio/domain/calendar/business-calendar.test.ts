import { describe, expect, test } from 'bun:test';
import {
  addDays,
  BusinessCalendar,
  diffDays,
  isLocalDate,
  isoWeekday,
  isValidTimeZone,
  localDateOf,
  mondayOf,
  startOfLocalDay,
  zoneOffsetMs,
} from './business-calendar';

const TZ = 'America/Managua';

describe('LocalDate arithmetic', () => {
  test('validates real calendar dates', () => {
    expect(isLocalDate('2026-10-26')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('26-10-2026')).toBe(false);
  });

  test('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(diffDays('2027-01-04', '2026-12-28')).toBe(7);
    expect(diffDays('2026-12-28', '2027-01-04')).toBe(-7);
  });

  test('Monday is the first ISO weekday, also across new year', () => {
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(isoWeekday('2026-11-01')).toBe(7);
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
    expect(mondayOf('2027-01-03')).toBe('2026-12-28');
    expect(mondayOf('2027-01-04')).toBe('2027-01-04');
  });
});

describe('time zone conversion (America/Managua, UTC-6 without DST)', () => {
  test('offset is −6 h all year', () => {
    expect(zoneOffsetMs(new Date('2026-01-15T12:00:00Z'), TZ)).toBe(-6 * 3_600_000);
    expect(zoneOffsetMs(new Date('2026-07-15T12:00:00Z'), TZ)).toBe(-6 * 3_600_000);
  });

  test('local date flips at 06:00 UTC', () => {
    expect(localDateOf(new Date('2026-10-26T05:59:59Z'), TZ)).toBe('2026-10-25');
    expect(localDateOf(new Date('2026-10-26T06:00:00Z'), TZ)).toBe('2026-10-26');
  });

  test('new year: Dec 31st 23:30 local is still the old year', () => {
    expect(localDateOf(new Date('2027-01-01T05:30:00Z'), TZ)).toBe('2026-12-31');
    expect(localDateOf(new Date('2027-01-01T06:00:00Z'), TZ)).toBe('2027-01-01');
  });

  test('start of local day', () => {
    expect(startOfLocalDay('2026-10-26', TZ).toISOString()).toBe('2026-10-26T06:00:00.000Z');
    expect(startOfLocalDay('2027-01-01', TZ).toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });

  test('zones with DST are handled too', () => {
    expect(startOfLocalDay('2026-03-30', 'Europe/Madrid').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
    expect(startOfLocalDay('2026-03-28', 'Europe/Madrid').toISOString()).toBe(
      '2026-03-27T23:00:00.000Z',
    );
  });

  test('validates IANA zones', () => {
    expect(isValidTimeZone(TZ)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('BusinessCalendar', () => {
  const cal = new BusinessCalendar(TZ);

  test('Monday 06:00 Managua (cron time) is that Monday', () => {
    const cron = new Date('2026-10-26T12:00:00Z');
    expect(cal.today(cron)).toBe('2026-10-26');
    expect(cal.currentMonday(cron)).toBe('2026-10-26');
  });

  test('Sunday night local still belongs to the previous week', () => {
    expect(cal.currentMonday(new Date('2026-11-02T05:00:00Z'))).toBe('2026-10-26');
  });

  test('week range is [Monday 00:00, next Monday 00:00) local, across new year', () => {
    expect(cal.week('2026-12-28')).toEqual({
      start: new Date('2026-12-28T06:00:00Z'),
      end: new Date('2027-01-04T06:00:00Z'),
    });
  });
});
