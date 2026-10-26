import { describe, expect, test } from 'bun:test';
import { greeting } from './login-page';

// Managua es UTC-6 todo el año (sin horario de verano).
const managua = (hour: number) => new Date(Date.UTC(2026, 9, 26, hour + 6, 30));

describe('greeting', () => {
  test('usa la hora de Managua para el saludo', () => {
    expect(greeting(managua(8))).toBe('Buenos días');
    expect(greeting(managua(14))).toBe('Buenas tardes');
    expect(greeting(managua(21))).toBe('Buenas noches');
    expect(greeting(managua(3))).toBe('Buenas noches');
  });
});
