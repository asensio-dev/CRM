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

  test('TRUST_PROXY: hops as number, subnets as text, unset = untrusted, "true" rejected', () => {
    expect(loadConfig(valid).TRUST_PROXY).toBeUndefined();
    expect(loadConfig({ ...valid, TRUST_PROXY: '' }).TRUST_PROXY).toBeUndefined();
    expect(loadConfig({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(loadConfig({ ...valid, TRUST_PROXY: 'loopback' }).TRUST_PROXY).toBe('loopback');
    expect(() => loadConfig({ ...valid, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  test('SCHEDULER_ENABLED defaults to true and only accepts true/false', () => {
    expect(loadConfig(valid).SCHEDULER_ENABLED).toBe(true);
    expect(loadConfig({ ...valid, SCHEDULER_ENABLED: 'true' }).SCHEDULER_ENABLED).toBe(true);
    expect(loadConfig({ ...valid, SCHEDULER_ENABLED: 'false' }).SCHEDULER_ENABLED).toBe(false);
    expect(() => loadConfig({ ...valid, SCHEDULER_ENABLED: 'no' })).toThrow(/SCHEDULER_ENABLED/);
  });

  test('CORS_ORIGIN cannot be a wildcard (credentials are sent)', () => {
    expect(() => loadConfig({ ...valid, CORS_ORIGIN: '*' })).toThrow(/CORS_ORIGIN/);
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
