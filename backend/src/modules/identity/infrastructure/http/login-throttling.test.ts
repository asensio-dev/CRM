import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { GetMeUseCase } from '../../application/use-cases/get-me.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { TOKEN_ISSUER } from '../../domain';
import { AuthController } from './auth.controller';
import { LOGIN_THROTTLERS, loginAccountTracker } from './login-throttling';

let app: INestApplication;
let base: string;

const rejectAll = {
  execute: async () => {
    throw new UnauthorizedException('Credenciales inválidas');
  },
};

beforeAll(async () => {
  // Mismo throttler por cuenta que producción; el de IP se relaja para aislar el de cuenta.
  const account = LOGIN_THROTTLERS.find((t) => t.name === 'account');
  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([
        { name: 'default', ttl: 60_000, limit: 1000 },
        { ...account, limit: 3 } as (typeof LOGIN_THROTTLERS)[number],
      ]),
    ],
    controllers: [AuthController],
    providers: [
      { provide: LoginUseCase, useValue: rejectAll },
      { provide: RefreshSessionUseCase, useValue: rejectAll },
      { provide: LogoutUseCase, useValue: { execute: async () => undefined } },
      { provide: GetMeUseCase, useValue: rejectAll },
      { provide: TOKEN_ISSUER, useValue: { refreshTtlSeconds: 60 } },
    ],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(0);
  base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost');
});

afterAll(async () => {
  await app.close();
});

const login = (email: string) =>
  fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'x'.repeat(10) }),
  }).then((r) => r.status);

describe('límite de login por cuenta', () => {
  test('bloquea la cuenta atacada (aunque cambie mayúsculas) sin afectar a otras', async () => {
    const statuses = [
      await login('ana@axiom.test'),
      await login('ANA@axiom.test'),
      await login('aNa@axiom.test'),
      await login('Ana@Axiom.test'),
    ];
    expect(statuses).toEqual([401, 401, 401, 429]);
    expect(await login('otra@axiom.test')).toBe(401);
  });

  test('el refresh no consume el límite por cuenta', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await fetch(`${base}/auth/refresh`, { method: 'POST' })).status);
    }
    expect(statuses.every((s) => s === 401)).toBe(true);
  });

  test('tracker: correo normalizado o, si falta, la IP', () => {
    expect(loginAccountTracker({ ip: '1.2.3.4', body: { email: ' A@B.com ' } })).toBe(
      'email:a@b.com',
    );
    expect(loginAccountTracker({ ip: '1.2.3.4', body: {} })).toBe('ip:1.2.3.4');
    expect(loginAccountTracker({ ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
  });
});
