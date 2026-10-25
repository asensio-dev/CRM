import { describe, expect, test } from 'bun:test';
import type { LoginResponse } from '@axiom/contracts';
import { createApiClient, HttpError } from './client';

const user = { id: 1, email: 'a@b.co', fullName: 'Ana Pérez', role: 'EJECUTIVO' as const };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Call {
  url: string;
  init: RequestInit;
}

function setup(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchMock = (async (input: string, init: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call, calls.length);
  }) as unknown as typeof fetch;
  let failures = 0;
  const refreshed: LoginResponse[] = [];
  const client = createApiClient({
    fetchImpl: () => fetchMock,
    onAuthFailure: () => {
      failures++;
    },
    onRefreshed: (s) => refreshed.push(s),
  });
  return { client, calls, refreshed, failures: () => failures };
}

const authHeader = (c: Call) => (c.init.headers as Record<string, string>).Authorization;

describe('api client', () => {
  test('adjunta el access token en memoria como Bearer', async () => {
    const { client, calls } = setup(() => json({ ok: true }));
    client.setAccessToken('tok-1');
    await client.get('/companies');
    expect(calls[0]?.url).toBe('/api/companies');
    expect(authHeader(calls[0] as Call)).toBe('Bearer tok-1');
    expect(calls[0]?.init.credentials).toBe('include');
  });

  test('convierte errores en HttpError con la forma ApiError', async () => {
    const { client } = setup(() =>
      json({ statusCode: 422, code: 'RULE', message: 'Transición inválida' }, 422),
    );
    const err = await client.get('/x').catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ statusCode: 422, code: 'RULE', message: 'Transición inválida' });
  });

  test('en 401 refresca una vez y reintenta con el token nuevo', async () => {
    const { client, calls, refreshed } = setup((call) => {
      if (call.url === '/api/auth/refresh') return json({ accessToken: 'new', user });
      return authHeader(call) === 'Bearer new' ? json({ ok: 1 }) : json({}, 401);
    });
    client.setAccessToken('old');
    const out = await client.get<{ ok: number }>('/me-things');
    expect(out).toEqual({ ok: 1 });
    expect(calls.map((c) => c.url)).toEqual([
      '/api/me-things',
      '/api/auth/refresh',
      '/api/me-things',
    ]);
    expect(refreshed).toHaveLength(1);
    expect(client.getAccessToken()).toBe('new');
  });

  test('401 concurrentes comparten un único refresh', async () => {
    const { client, calls } = setup(async (call) => {
      if (call.url === '/api/auth/refresh') {
        await new Promise((r) => setTimeout(r, 10));
        return json({ accessToken: 'new', user });
      }
      return authHeader(call) === 'Bearer new' ? json({ ok: 1 }) : json({}, 401);
    });
    client.setAccessToken('old');
    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(results).toHaveLength(3);
    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  test('si el refresh falla, cierra sesión y propaga el error', async () => {
    const { client, failures, calls } = setup((call) =>
      call.url === '/api/auth/refresh'
        ? json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Sesión expirada' }, 401)
        : json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'No autenticado' }, 401),
    );
    client.setAccessToken('old');
    const err = (await client.get('/a').catch((e) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(401);
    expect(failures()).toBe(1);
    expect(client.getAccessToken()).toBeNull();
    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  test('un 401 en login no dispara refresh', async () => {
    const { client, calls } = setup(() =>
      json(
        { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' },
        401,
      ),
    );
    const err = (await client
      .request('/auth/login', { method: 'POST', body: {}, skipAuthRetry: true })
      .catch((e) => e)) as HttpError;
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(calls).toHaveLength(1);
  });

  test('nunca guarda el token en localStorage ni sessionStorage', async () => {
    const { client } = setup(() => json({ accessToken: 'secret-in-memory', user }));
    await client.refresh();
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-in-memory');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-in-memory');
  });

  test('204 devuelve undefined', async () => {
    const { client } = setup(() => new Response(null, { status: 204 }));
    expect(await client.post('/auth/logout')).toBeUndefined();
  });
});
