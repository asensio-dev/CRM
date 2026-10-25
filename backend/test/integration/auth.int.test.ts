import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { bootApp, cookieFrom, expectError, type TestApp } from '../support/app';
import { passwordVar, TEST_USERS } from '../support/test-database';

const admin = TEST_USERS[0];

describe('auth: login y roles', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.close());

  test('login correcto devuelve access token, usuario y cookie httpOnly de refresh', async () => {
    const res = await t.api<{ accessToken: string; user: { role: string } }>(
      'POST',
      '/auth/login',
      {
        body: { email: admin.email, password: process.env[passwordVar('admin')] },
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.user.role).toBe('ADMIN');
    const setCookie = res.headers.getSetCookie().join(';');
    expect(setCookie).toContain('refresh_token=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie).toContain('Path=/api/auth');
  });

  test('credenciales inválidas y usuario inexistente dan el mismo 401', async () => {
    const bad = await t.api<{ message: string }>('POST', '/auth/login', {
      body: { email: admin.email, password: 'incorrecta-123' },
    });
    const unknown = await t.api<{ message: string }>('POST', '/auth/login', {
      body: { email: 'nadie@test.axiom', password: 'incorrecta-123' },
    });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(bad.body.message);
  });

  test('sin token → 401; token basura → 401', async () => {
    expectError(await t.api('GET', '/auth/me'), 401);
    expectError(await t.api('GET', '/companies', { token: 'no.es.jwt' }), 401);
  });
});

// App aparte: el login está limitado a 5 intentos/minuto por IP y cada app tiene su propio contador.
describe('auth: roles', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.close());

  test('/auth/me devuelve al usuario autenticado', async () => {
    const s = await t.login('supervisor');
    const me = await t.api<{ email: string; role: string }>('GET', '/auth/me', { token: s.token });
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('SUPERVISOR');
  });

  test('403 por rol: EJECUTIVO no administra usuarios ni importa ni corre la rotación', async () => {
    const s = await t.login('exec1');
    expectError(await t.api('GET', '/users', { token: s.token }), 403);
    expectError(await t.api('POST', '/portfolio/run-weekly', { token: s.token }), 403);
    expectError(await t.api('GET', '/import/1', { token: s.token }), 403);
  });

  test('403 por rol: SUPERVISOR no puede administrar usuarios ni ejecutar la rotación', async () => {
    const s = await t.login('supervisor');
    expectError(await t.api('GET', '/users', { token: s.token }), 403);
    expectError(await t.api('POST', '/portfolio/run-weekly', { token: s.token }), 403);
  });

  test('ADMIN sí lista usuarios', async () => {
    const s = await t.login('admin');
    const res = await t.api<{ items: unknown[] }>('GET', '/users', { token: s.token });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(4);
  });

  test('health es público', async () => {
    const res = await t.api<{ status: string }>('GET', '/health');
    expect(res.status).toBe(200);
  });
});

describe('auth: refresh con rotación y detección de reutilización', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.close());

  test('rota el refresh token; reenviar el anterior dentro del margen de gracia (ADR 0007) da sesión nueva y revoca el sucesor perdido', async () => {
    const first = await t.login('exec2');
    expect(first.cookie).toStartWith('refresh_token=');

    const rotated = await t.api<{ accessToken: string }>('POST', '/auth/refresh', {
      cookie: first.cookie,
    });
    expect(rotated.status).toBe(200);
    const second = cookieFrom(rotated.headers);
    expect(second).toBeDefined();
    expect(second).not.toBe(first.cookie);
    expect(rotated.body.accessToken).toBeTruthy();

    // Recarga con el refresh en vuelo: el navegador reenvía el token ya rotado → sesión nueva…
    const retried = await t.api<{ accessToken: string }>('POST', '/auth/refresh', {
      cookie: first.cookie,
    });
    expect(retried.status).toBe(200);
    // …y el sucesor que el navegador nunca guardó queda invalidado.
    expectError(await t.api('POST', '/auth/refresh', { cookie: second as string }), 401);
  });

  test('reutilizar un token rotado cuyo sucesor se cerró con logout → 401 (no revive la sesión)', async () => {
    const first = await t.login('exec2');
    const rotated = await t.api('POST', '/auth/refresh', { cookie: first.cookie });
    const second = cookieFrom(rotated.headers) as string;
    const out = await t.api('POST', '/auth/logout', { cookie: second });
    expect(out.status).toBe(204);
    expectError(await t.api('POST', '/auth/refresh', { cookie: first.cookie }), 401);
  });

  test('refresh sin cookie → 401', async () => {
    expectError(await t.api('POST', '/auth/refresh'), 401);
  });

  test('logout revoca el refresh token', async () => {
    const res = await t.api<{ accessToken: string }>('POST', '/auth/login', {
      body: { email: TEST_USERS[1].email, password: process.env[passwordVar('supervisor')] },
    });
    const cookie = cookieFrom(res.headers) as string;
    const out = await t.api('POST', '/auth/logout', { cookie });
    expect(out.status).toBe(204);
    expectError(await t.api('POST', '/auth/refresh', { cookie }), 401);
  });
});

describe('auth: throttling del login', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.close());

  test('tras 5 intentos por minuto el 6.º recibe 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await t.api('POST', '/auth/login', {
        body: { email: 'intruso@test.axiom', password: 'incorrecta-123' },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});
