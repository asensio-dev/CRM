import { describe, expect, test } from 'bun:test';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../../../shared/infrastructure/http/auth.decorators';
import { FakeClock, makeIssuer } from '../../test-support';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctx(meta: Record<string, unknown>, headers: Record<string, string> = {}) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers };
  const handler = () => undefined;
  const klass = class {};
  for (const [k, v] of Object.entries(meta)) Reflect.defineMetadata(k, v, handler);
  const context = {
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const clock = new FakeClock();
const issuer = makeIssuer(clock);
const guard = new JwtAuthGuard(new Reflector(), issuer);
const bearer = async (role: 'ADMIN' | 'EJECUTIVO') => ({
  authorization: `Bearer ${await issuer.issueAccess({ userId: 7, email: 'a@b.com', role })}`,
});

describe('JwtAuthGuard', () => {
  test('permite rutas públicas sin token', async () => {
    const { context } = ctx({ [IS_PUBLIC_KEY]: true });
    expect(await guard.canActivate(context)).toBe(true);
  });

  test('401 sin token o con esquema distinto de Bearer', async () => {
    await expect(guard.canActivate(ctx({}).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(ctx({}, { authorization: 'Basic abc' }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('401 con token inválido, de otra firma o de tipo refresh', async () => {
    await expect(
      guard.canActivate(ctx({}, { authorization: 'Bearer basura' }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const foreign = await makeIssuer(clock).issueAccess({
      userId: 1,
      email: 'a@b.com',
      role: 'ADMIN',
    });
    await expect(
      guard.canActivate(ctx({}, { authorization: `Bearer ${foreign}` }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const refresh = (await issuer.issueRefresh(1)).token;
    await expect(
      guard.canActivate(ctx({}, { authorization: `Bearer ${refresh}` }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('401 con token caducado', async () => {
    const headers = await bearer('ADMIN');
    clock.advanceSeconds(16 * 60);
    await expect(guard.canActivate(ctx({}, headers).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    clock.advanceSeconds(-16 * 60);
  });

  test('token válido rellena request.user', async () => {
    const { context, request } = ctx({}, await bearer('EJECUTIVO'));
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({ id: 7, email: 'a@b.com', role: 'EJECUTIVO' });
  });

  test('403 si el rol no coincide; OK si coincide', async () => {
    const meta = { [ROLES_KEY]: ['ADMIN'] };
    await expect(
      guard.canActivate(ctx(meta, await bearer('EJECUTIVO')).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await guard.canActivate(ctx(meta, await bearer('ADMIN')).context)).toBe(true);
  });
});
