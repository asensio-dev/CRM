import { mock } from 'bun:test';

export interface MockResponse {
  __reply: true;
  status: number;
  body: unknown;
}
/** Respuesta con código HTTP explícito (por defecto los handlers devuelven 200). */
export const reply = (status: number, body: unknown): MockResponse => ({
  __reply: true,
  status,
  body,
});

type Handler = (req: { url: URL; method: string; body: unknown }) => unknown;

/** Sustituye `fetch` por un enrutador simple: clave `"GET /api/ruta"` (sin query). */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; url: URL; body: unknown }[] = [];
  const fn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost:5173');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const key = `${method} ${url.pathname}`;
    calls.push({ key, url, body });
    const handler = routes[key];
    if (!handler) {
      return new Response(JSON.stringify({ code: 'NOT_MOCKED', message: key }), { status: 404 });
    }
    const out = handler({ url, method, body });
    const res: MockResponse =
      typeof out === 'object' && out !== null && '__reply' in out
        ? (out as MockResponse)
        : { __reply: true, status: 200, body: out };
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { calls, fn };
}
