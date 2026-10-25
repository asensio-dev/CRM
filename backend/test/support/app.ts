import 'reflect-metadata';
import type { ApiError } from '@axiom/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/shared/infrastructure/http/domain-exception.filter';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { assertTestDatabase, passwordVar, TEST_USERS, type TestUserKey } from './test-database';

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface Session {
  token: string;
  cookie: string;
  user: { id: number; email: string; role: string; fullName: string };
}

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  prisma: PrismaService;
  /** Petición HTTP real contra el servidor Nest (puerto efímero). */
  api<T = unknown>(
    method: string,
    path: string,
    opts?: { token?: string; body?: unknown; cookie?: string; form?: FormData },
  ): Promise<ApiResponse<T>>;
  login(key: TestUserKey): Promise<Session>;
  close(): Promise<void>;
}

/** Arranca el AppModule real (mismo cableado que main.ts) contra AxiomCRM_Test. */
export async function bootApp(
  opts: { port?: number; throttling?: boolean } = {},
): Promise<TestApp> {
  assertTestDatabase(process.env.DATABASE_URL); // nunca la base de desarrollo

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.throttling === false) {
    // E2E: todos los navegadores comparten IP y el login admite 5 intentos/min (se prueba en integración).
    builder = builder.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(opts.port ?? 0, '127.0.0.1');
  const baseUrl = `${(await app.getUrl()).replace('[::1]', '127.0.0.1')}/api`;

  const sessions = new Map<TestUserKey, Session>();

  async function api<T>(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; cookie?: string; form?: FormData } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.cookie) headers.cookie = opts.cookie;
    let body: string | FormData | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // cuerpo no JSON
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  return {
    app,
    baseUrl,
    prisma: app.get(PrismaService),
    api,
    async login(key) {
      const cached = sessions.get(key);
      if (cached) return cached;
      const user = TEST_USERS.find((u) => u.key === key);
      const password = process.env[passwordVar(key)];
      if (!user || !password) throw new Error(`Falta ${passwordVar(key)} (ejecuta test:db)`);
      const res = await api<{ accessToken: string; user: Session['user'] }>('POST', '/auth/login', {
        body: { email: user.email, password },
      });
      if (res.status !== 200) throw new Error(`Login de ${key} falló: ${res.status}`);
      const session = {
        token: res.body.accessToken,
        cookie: cookieFrom(res.headers) ?? '',
        user: res.body.user,
      };
      sessions.set(key, session);
      return session;
    },
    close: () => app.close(),
  };
}

/** `refresh_token=…` del Set-Cookie de una respuesta. */
export function cookieFrom(headers: Headers): string | undefined {
  const raw = headers.getSetCookie().find((c) => c.startsWith('refresh_token='));
  return raw?.split(';')[0];
}

export function expectError(res: ApiResponse, status: number, code?: string): void {
  const body = res.body as Partial<ApiError> | null;
  if (res.status !== status || (code && body?.code !== code)) {
    throw new Error(
      `Esperaba ${status}${code ? ` ${code}` : ''} y llegó ${res.status} ${JSON.stringify(body)}`,
    );
  }
}

let seq = 0;
/** RUC único y legible para empresas creadas por una prueba. */
export function uniqueRuc(prefix = 'ITG'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36).toUpperCase()}${seq}`.slice(0, 20);
}
