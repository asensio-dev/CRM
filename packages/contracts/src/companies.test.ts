import { describe, expect, test } from 'bun:test';
import { normalizePhone, normalizeRuc, normalizeSearchText, RucSchema } from './companies';

describe('company normalization', () => {
  test('normalizes RUC from text or number', () => {
    expect(normalizeRuc(' j9990000000001 ')).toBe('J9990000000001');
    expect(normalizeRuc(999000111)).toBe('999000111');
    expect(normalizeRuc('')).toBeNull();
    expect(normalizeRuc(null)).toBeNull();
  });

  test('normalizes phones and rejects implausible ones', () => {
    expect(normalizePhone(29990011)).toBe('29990011');
    expect(normalizePhone('2999-0011')).toBe('29990011');
    expect(normalizePhone('+505 8999 0022')).toBe('+50589990022');
    expect(normalizePhone('0')).toBeNull();
  });

  test('normalizeSearchText matches the searchText computed column rules', () => {
    expect(normalizeSearchText('  Ferretería   Año ')).toBe('FERRETERIA ANO');
    expect(normalizeSearchText('pingüino')).toBe('PINGUINO');
    expect(normalizeSearchText('j0310')).toBe('J0310');
  });

  test('RucSchema rejects empty input', () => {
    expect(RucSchema.safeParse('  ').success).toBe(false);
    expect(RucSchema.parse('j031')).toBe('J031');
  });
});
