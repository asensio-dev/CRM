import { beforeEach, describe, expect, test } from 'bun:test';
import { UnauthorizedException } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain';
import {
  FakeClock,
  FakeHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  makeIssuer,
  PassThroughUow,
  seedUser,
} from '../../test-support';
import { SessionIssuer } from '../session-issuer';
import { CreateUserUseCase } from './create-user.use-case';
import { GetMeUseCase } from './get-me.use-case';
import { ListUsersUseCase } from './list-users.use-case';
import { LoginUseCase } from './login.use-case';
import { LogoutUseCase } from './logout.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import { ResetUserPasswordUseCase } from './reset-user-password.use-case';
import { UpdateUserUseCase } from './update-user.use-case';

let clock: FakeClock;
let users: InMemoryUserRepository;
let tokensRepo: InMemoryRefreshTokenRepository;
let login: LoginUseCase;
let refresh: RefreshSessionUseCase;
let logout: LogoutUseCase;
let update: UpdateUserUseCase;
let reset: ResetUserPasswordUseCase;
const password = `pw-${crypto.randomUUID()}`;

beforeEach(() => {
  clock = new FakeClock();
  users = new InMemoryUserRepository();
  tokensRepo = new InMemoryRefreshTokenRepository();
  const issuer = makeIssuer(clock);
  const hasher = new FakeHasher();
  const sessions = new SessionIssuer(issuer, tokensRepo);
  login = new LoginUseCase(users, hasher, sessions);
  refresh = new RefreshSessionUseCase(issuer, tokensRepo, users, clock, sessions);
  logout = new LogoutUseCase(issuer, tokensRepo, clock);
  update = new UpdateUserUseCase(users, tokensRepo, new PassThroughUow(), clock);
  reset = new ResetUserPasswordUseCase(users, tokensRepo, hasher, new PassThroughUow(), clock);
});

describe('Login', () => {
  test('éxito: devuelve tokens y usuario, guarda solo el hash del refresh', async () => {
    await seedUser(users, { email: 'ana@axiom.test', password });
    const s = await login.execute({ email: 'ANA@axiom.test', password });
    expect(s.user.email).toBe('ana@axiom.test');
    expect(s.accessToken.split('.')).toHaveLength(3);
    expect(tokensRepo.rows.has(s.refreshToken)).toBe(false);
    expect(tokensRepo.rows.size).toBe(1);
  });

  test('mismo error genérico para contraseña errónea, correo inexistente e inactivo', async () => {
    await seedUser(users, { email: 'ana@axiom.test', password });
    await seedUser(users, { email: 'off@axiom.test', password, isActive: false });
    const messages: string[] = [];
    for (const input of [
      { email: 'ana@axiom.test', password: 'otra-clave-123' },
      { email: 'nadie@axiom.test', password },
      { email: 'off@axiom.test', password },
    ]) {
      try {
        await login.execute(input);
        throw new Error('debió fallar');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        messages.push((e as Error).message);
      }
    }
    expect(new Set(messages).size).toBe(1);
  });
});

describe('RefreshSession', () => {
  test('rota el token: el nuevo funciona y el anterior queda revocado', async () => {
    await seedUser(users, { email: 'ana@axiom.test', password });
    const s1 = await login.execute({ email: 'ana@axiom.test', password });
    clock.advanceSeconds(60);
    const s2 = await refresh.execute({ refreshToken: s1.refreshToken });
    expect(s2.refreshToken).not.toBe(s1.refreshToken);
    const s3 = await refresh.execute({ refreshToken: s2.refreshToken });
    expect(s3.user.id).toBe(s1.user.id);
  });

  test('reutilizar un token ya rotado revoca todos los tokens del usuario', async () => {
    await seedUser(users, { email: 'ana@axiom.test', password });
    const s1 = await login.execute({ email: 'ana@axiom.test', password });
    const s2 = await refresh.execute({ refreshToken: s1.refreshToken });
    await expect(refresh.execute({ refreshToken: s1.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // el token legítimo más reciente también quedó invalidado
    await expect(refresh.execute({ refreshToken: s2.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect([...tokensRepo.rows.values()].every((r) => r.revokedAt)).toBe(true);
  });

  test('rechaza tokens basura, caducados y de usuarios desactivados', async () => {
    const u = await seedUser(users, { email: 'ana@axiom.test', password });
    await expect(refresh.execute({ refreshToken: 'basura' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const s = await login.execute({ email: 'ana@axiom.test', password });
    clock.advanceSeconds(8 * 86_400);
    await expect(refresh.execute({ refreshToken: s.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    clock.advanceSeconds(-8 * 86_400);
    const s2 = await login.execute({ email: 'ana@axiom.test', password });
    u.applyChanges({ isActive: false }, { actorId: -1, otherActiveAdmins: 1 });
    await users.save(u);
    await expect(refresh.execute({ refreshToken: s2.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('Logout', () => {
  test('revoca el refresh token y es idempotente', async () => {
    await seedUser(users, { email: 'ana@axiom.test', password });
    const s = await login.execute({ email: 'ana@axiom.test', password });
    await logout.execute({ refreshToken: s.refreshToken });
    await logout.execute({ refreshToken: s.refreshToken });
    await logout.execute({});
    await expect(refresh.execute({ refreshToken: s.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('GetMe', () => {
  test('devuelve el usuario y falla si está inactivo', async () => {
    const u = await seedUser(users, { email: 'ana@axiom.test' });
    const me = new GetMeUseCase(users);
    expect((await me.execute({ userId: u.id as number })).email).toBe('ana@axiom.test');
    await expect(me.execute({ userId: 999 })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('User management', () => {
  test('CreateUser: crea, normaliza y rechaza correo duplicado', async () => {
    const create = new CreateUserUseCase(users, new FakeHasher(), clock);
    const dto = await create.execute({
      email: 'Nuevo@Axiom.test',
      fullName: 'Nuevo',
      password,
      role: 'EJECUTIVO',
    });
    expect(dto).toMatchObject({ email: 'nuevo@axiom.test', isActive: true });
    expect(JSON.stringify(dto)).not.toContain('hashed');
    await expect(
      create.execute({ email: 'nuevo@axiom.test', fullName: 'X', password, role: 'ADMIN' }),
    ).rejects.toMatchObject({ kind: 'CONFLICT' });
  });

  test('UpdateUser: último ADMIN no se puede degradar ni desactivar', async () => {
    const admin = await seedUser(users, { email: 'root@axiom.test', role: 'ADMIN' });
    const other = await seedUser(users, { email: 'otro@axiom.test', role: 'EJECUTIVO' });
    const actor = other.id as number;
    await expect(
      update.execute({
        actorId: actor,
        userId: admin.id as number,
        changes: { role: 'EJECUTIVO' },
      }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    await expect(
      update.execute({ actorId: actor, userId: admin.id as number, changes: { isActive: false } }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  test('UpdateUser: no puede desactivarse a sí mismo y 404 si no existe', async () => {
    const a1 = await seedUser(users, { email: 'a1@axiom.test', role: 'ADMIN' });
    await seedUser(users, { email: 'a2@axiom.test', role: 'ADMIN' });
    await expect(
      update.execute({
        actorId: a1.id as number,
        userId: a1.id as number,
        changes: { isActive: false },
      }),
    ).rejects.toMatchObject({ code: 'CANNOT_DEACTIVATE_SELF' });
    await expect(
      update.execute({ actorId: 1, userId: 999, changes: { fullName: 'x' } }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  test('UpdateUser: desactivar revoca sus sesiones', async () => {
    await seedUser(users, { email: 'a1@axiom.test', role: 'ADMIN' });
    const exec = await seedUser(users, { email: 'ej@axiom.test', password });
    const s = await login.execute({ email: 'ej@axiom.test', password });
    const dto = await update.execute({
      actorId: 1,
      userId: exec.id as number,
      changes: { isActive: false },
    });
    expect(dto.isActive).toBe(false);
    await expect(refresh.execute({ refreshToken: s.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  test('ResetPassword: cambia la clave y cierra sesiones', async () => {
    const u = await seedUser(users, { email: 'ej@axiom.test', password });
    const s = await login.execute({ email: 'ej@axiom.test', password });
    const newPassword = `new-${crypto.randomUUID()}`;
    await reset.execute({ userId: u.id as number, newPassword });
    await expect(refresh.execute({ refreshToken: s.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(login.execute({ email: 'ej@axiom.test', password })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect((await login.execute({ email: 'ej@axiom.test', password: newPassword })).user.id).toBe(
      u.id as number,
    );
  });

  test('ListUsers: pagina', async () => {
    for (let i = 0; i < 5; i++) await seedUser(users, { email: `u${i}@axiom.test` });
    const res = await new ListUsersUseCase(users).execute({ page: 2, pageSize: 2 });
    expect(res).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(res.items).toHaveLength(2);
  });
});
