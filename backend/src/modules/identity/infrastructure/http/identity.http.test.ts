import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { CLOCK, UNIT_OF_WORK } from '../../../../shared/application';
import { APP_CONFIG } from '../../../../shared/infrastructure/config/env';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { SessionIssuer } from '../../application/session-issuer';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { GetMeUseCase } from '../../application/use-cases/get-me.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { ResetUserPasswordUseCase } from '../../application/use-cases/reset-user-password.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_ISSUER,
  USER_REPOSITORY,
} from '../../domain';
import {
  FakeClock,
  FakeHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  PassThroughUow,
  seedUser,
  testConfig,
} from '../../test-support';
import { JoseTokenIssuer } from '../security/jose-token-issuer';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersController } from './users.controller';

let app: INestApplication;
let base: string;
const adminPw = `pw-${crypto.randomUUID()}`;
const execPw = `pw-${crypto.randomUUID()}`;
const users = new InMemoryUserRepository();

function cookieOf(res: Response): string | undefined {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith('refresh_token='))
    ?.split(';')[0];
}

async function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  await seedUser(users, { email: 'admin@axiom.test', password: adminPw, role: 'ADMIN' });
  await seedUser(users, { email: 'ej@axiom.test', password: execPw, role: 'EJECUTIVO' });

  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
    controllers: [AuthController, UsersController],
    providers: [
      { provide: APP_CONFIG, useValue: testConfig() },
      { provide: CLOCK, useValue: new FakeClock(new Date()) },
      { provide: UNIT_OF_WORK, useValue: new PassThroughUow() },
      { provide: USER_REPOSITORY, useValue: users },
      { provide: REFRESH_TOKEN_REPOSITORY, useValue: new InMemoryRefreshTokenRepository() },
      { provide: PASSWORD_HASHER, useValue: new FakeHasher() },
      { provide: TOKEN_ISSUER, useClass: JoseTokenIssuer },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      SessionIssuer,
      LoginUseCase,
      RefreshSessionUseCase,
      LogoutUseCase,
      GetMeUseCase,
      CreateUserUseCase,
      UpdateUserUseCase,
      ResetUserPasswordUseCase,
      ListUsersUseCase,
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(0);
  base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost');
});

afterAll(async () => {
  await app.close();
});

describe('auth HTTP', () => {
  let access = '';
  let cookie = '';

  test('login ok: cuerpo + cookie httpOnly/Strict/path /api/auth', async () => {
    const res = await post('/auth/login', { email: 'admin@axiom.test', password: adminPw });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; user: { role: string } };
    expect(body.user.role).toBe('ADMIN');
    access = body.accessToken;
    const raw = res.headers.getSetCookie().find((c) => c.startsWith('refresh_token=')) as string;
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain('Path=/api/auth');
    cookie = cookieOf(res) as string;
  });

  test('me con Bearer; 401 sin token', async () => {
    const ok = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${access}` } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { email: string }).email).toBe('admin@axiom.test');
    expect((await fetch(`${base}/auth/me`)).status).toBe(401);
  });

  test('login con credenciales malas → 401 genérico; cuerpo inválido → 400', async () => {
    const res = await post('/auth/login', { email: 'admin@axiom.test', password: 'x'.repeat(10) });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { message: string }).message).toBe('Credenciales inválidas');
    expect((await post('/auth/login', { email: 'no' })).status).toBe(400);
  });

  test('refresh rota la cookie; el token viejo ya no sirve', async () => {
    const res = await post('/auth/refresh', undefined, { cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { accessToken: string }).accessToken).toBeTruthy();
    const next = cookieOf(res) as string;
    expect(next).not.toBe(cookie);
    expect((await post('/auth/refresh', undefined, { cookie })).status).toBe(401);
    expect((await post('/auth/refresh')).status).toBe(401);
  });

  test('logout → 204 y limpia la cookie', async () => {
    const res = await post('/auth/logout');
    expect(res.status).toBe(204);
    const cleared = res.headers
      .getSetCookie()
      .find((c) => c.startsWith('refresh_token=')) as string;
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
  });

  test('administración de usuarios: ADMIN sí, EJECUTIVO 403, anónimo 401', async () => {
    const adminAuth = { authorization: `Bearer ${access}` };
    const list = await fetch(`${base}/users`, { headers: adminAuth });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { total: number }).total).toBe(2);

    const created = await post(
      '/users',
      {
        email: 'nuevo@axiom.test',
        fullName: 'Nuevo',
        password: `pw-${crypto.randomUUID()}`,
        role: 'SUPERVISOR',
      },
      adminAuth,
    );
    expect(created.status).toBe(201);
    const dto = (await created.json()) as { id: number; passwordHash?: string };
    expect(dto.passwordHash).toBeUndefined();

    const patch = await fetch(`${base}/users/${dto.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...adminAuth },
      body: JSON.stringify({ isActive: false }),
    });
    expect(patch.status).toBe(200);
    const reset = await post(
      `/users/${dto.id}/reset-password`,
      { newPassword: `pw-${crypto.randomUUID()}` },
      adminAuth,
    );
    expect(reset.status).toBe(204);

    const execLogin = await post('/auth/login', { email: 'ej@axiom.test', password: execPw });
    const execToken = ((await execLogin.json()) as { accessToken: string }).accessToken;
    expect(
      (await fetch(`${base}/users`, { headers: { authorization: `Bearer ${execToken}` } })).status,
    ).toBe(403);
    expect((await fetch(`${base}/users`)).status).toBe(401);
  });

  test('rate limit: el 6.º login por minuto devuelve 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await post('/auth/login', { email: 'ej@axiom.test', password: 'x'.repeat(10) })).status,
      );
    }
    expect(statuses).toContain(429);
  });
});
