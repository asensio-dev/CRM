import { describe, expect, test } from 'bun:test';
import { cycleDays, formatDayRange, parseLocalDate } from './format';

describe('cycleDays', () => {
  test('21 días en 3 semanas con pasado, hoy y futuro', () => {
    const days = cycleDays('2026-10-19', 3, new Date(2026, 9, 27, 15, 0));
    expect(days).toHaveLength(21);
    expect(days.filter((d) => d.state === 'past')).toHaveLength(8);
    expect(days.find((d) => d.state === 'today')?.index).toBe(8);
    expect(days[8]?.week).toBe(2);
    expect(days[20]?.week).toBe(3);
    expect(days[20]?.date.getDate()).toBe(8);
  });

  test('antes del ciclo todo es futuro; después, todo pasado', () => {
    expect(
      cycleDays('2026-10-19', 3, new Date(2026, 9, 1)).every((d) => d.state === 'future'),
    ).toBe(true);
    expect(cycleDays('2026-10-19', 3, new Date(2026, 11, 1)).every((d) => d.state === 'past')).toBe(
      true,
    );
  });
});

describe('formatDayRange', () => {
  test('mismo mes y cambio de mes', () => {
    expect(formatDayRange(parseLocalDate('2026-10-19'), parseLocalDate('2026-10-25'))).toBe(
      '19–25 oct',
    );
    expect(formatDayRange(parseLocalDate('2026-10-26'), parseLocalDate('2026-11-01'))).toBe(
      '26 oct – 1 nov',
    );
  });
});
