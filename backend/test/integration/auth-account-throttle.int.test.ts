import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { bootApp, type TestApp } from '../support/app';

describe('auth: límite de intentos por cuenta', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp({ trustProxy: true });
  });
  afterAll(() => t.close());

  test('rotar de IP no evita el límite por correo (10 intentos / 15 min)', async () => {
    const email = 'victima@test.axiom';
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await t.api('POST', '/auth/login', {
        body: { email, password: 'incorrecta-123' },
        headers: { 'x-forwarded-for': `203.0.113.${i + 1}` }, // una IP distinta por intento
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);

    // otro correo desde otra IP sigue pudiendo intentar
    const other = await t.api('POST', '/auth/login', {
      body: { email: 'otra@test.axiom', password: 'incorrecta-123' },
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });
    expect(other.status).toBe(401);
  });
});
