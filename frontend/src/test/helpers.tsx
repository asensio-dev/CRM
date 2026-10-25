import type { UserRole } from '@axiom/contracts';
import { render } from '@testing-library/react';
import { createAppRouter, createTestHistory } from '@/app/router';
import { useSessionStore } from '@/features/auth/session-store';

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface RecordedCall {
  url: URL;
  method: string;
  body: unknown;
}

type Handler = (call: RecordedCall) => Response | undefined | Promise<Response | undefined>;

/** Sustituye `fetch` global. Devuelve las llamadas registradas; sin handler → 404. */
export function mockFetch(handler: Handler) {
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const raw = init?.body;
    const call: RecordedCall = {
      url: new URL(String(input), 'http://localhost:5173'),
      method: init?.method ?? 'GET',
      body: typeof raw === 'string' ? JSON.parse(raw) : raw,
    };
    calls.push(call);
    return (
      (await handler(call)) ??
      jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado' }, 404)
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function signIn(role: UserRole = 'ADMIN', id = 1) {
  useSessionStore.setState({
    status: 'authenticated',
    user: { id, email: 'admin@empresa.com', fullName: 'Ana Pérez', role },
  });
}

/** Monta la app completa en `path` con sesión iniciada. */
export async function mountApp(path: string, role: UserRole = 'ADMIN') {
  signIn(role);
  const router = createAppRouter(createTestHistory(path));
  const { App } = await import('@/app/providers');
  render(<App router={router} />);
  return router;
}
