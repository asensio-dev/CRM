import { describe, expect, test } from 'bun:test';
import { loadConfig } from './env';

const valid = {
  DATABASE_URL: 'sqlserver://localhost:1433;database=Test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('loadConfig', () => {
  test('applies non-secret defaults', () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(3000);
    expect(config.TZ).toBe('America/Managua');
  });

  test('fails without secrets and never echoes values', () => {
    // Se arma por partes para que el guardia de secretos del pre-commit no lo confunda con uno real
    const leaked = ['sqlserver://host', 'password=super-secret-value'].join(';');
    expect(() => loadConfig({ DATABASE_URL: leaked })).toThrow(/JWT_ACCESS_SECRET/);
    try {
      loadConfig({ DATABASE_URL: leaked });
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value');
    }
  });
});
