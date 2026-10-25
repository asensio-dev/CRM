import { describe, expect, test } from 'bun:test';
import { formatDecimalString, formatMoney } from './money';

describe('money', () => {
  test('agrupa miles y asegura 2 decimales desde el texto', () => {
    expect(formatDecimalString('1500.5')).toBe('1,500.50');
    expect(formatDecimalString('0')).toBe('0.00');
    expect(formatDecimalString('1234567.89')).toBe('1,234,567.89');
  });

  test('es exacto por encima de 2^53 (no pasa por float)', () => {
    expect(formatDecimalString('9007199254740993.01')).toBe('9,007,199,254,740,993.01');
  });

  test('símbolo por moneda', () => {
    expect(formatMoney('1500.00', 'NIO')).toBe('C$ 1,500.00');
    expect(formatMoney('2000.5', 'USD')).toBe('US$ 2,000.50');
    expect(formatMoney(12000, 'USD')).toBe('US$ 12,000.00');
  });
});
