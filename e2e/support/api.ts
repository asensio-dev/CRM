import type { APIRequestContext } from '@playwright/test';
import { passwordOf, USERS, type UserKey } from './auth';

/** Cliente mínimo de la API (a través del proxy de Vite) para preparar datos de una prueba. */
export async function apiAs(request: APIRequestContext, key: UserKey) {
  const login = await request.post('/api/auth/login', {
    data: { email: USERS[key].email, password: passwordOf(key) },
  });
  if (!login.ok()) throw new Error(`Login API de ${key} falló: ${login.status()}`);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { authorization: `Bearer ${accessToken}` };

  async function call<T>(method: 'post' | 'get', path: string, data?: unknown): Promise<T> {
    const res = await request[method](`/api${path}`, { headers, data });
    if (!res.ok())
      throw new Error(`${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`);
    return (await res.json()) as T;
  }

  return {
    post: <T>(path: string, data?: unknown) => call<T>('post', path, data),
    get: <T>(path: string) => call<T>('get', path),
    /** Empresa nueva en CON_RESPUESTA (INTERESADO desde POR_CONTACTAR). */
    async companyWithResponse(legalName: string): Promise<{ id: number }> {
      const ruc = `E2E${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
      const company = await call<{ id: number }>('post', '/companies', {
        ruc,
        legalName,
        phone: '22705555',
        employeeCount: 40,
      });
      await call('post', `/pipeline/companies/${company.id}/interactions`, {
        channel: 'LLAMADA',
        outcome: 'INTERESADO',
      });
      return company;
    },
  };
}
