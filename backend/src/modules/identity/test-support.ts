import type { UserRole } from '@axiom/contracts';
import type { Clock, UnitOfWork } from '../../shared/application';
import type { AppConfig } from '../../shared/infrastructure/config/env';
import {
  Email,
  type PasswordHasher,
  type RefreshTokenRepository,
  type StoredRefreshToken,
  User,
  type UserRepository,
} from './domain';
import { JoseTokenIssuer } from './infrastructure/security/jose-token-issuer';

/** Utilidades de test: adaptadores en memoria. Los secretos se generan al vuelo. */

export class FakeClock implements Clock {
  constructor(private current = new Date('2026-01-01T00:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export class FakeHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }
  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

export class PassThroughUow implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class InMemoryUserRepository implements UserRepository {
  private rows = new Map<number, User>();
  private seq = 0;

  async findById(id: number) {
    return this.rows.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.rows.values()].find((u) => u.email.value === email) ?? null;
  }
  async save(user: User) {
    const id = user.id ?? ++this.seq;
    const saved = User.rehydrate({
      id,
      email: user.email,
      fullName: user.fullName,
      passwordHash: user.passwordHash,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
    this.rows.set(id, saved);
    return saved;
  }
  async countActiveAdmins(excludingUserId?: number) {
    return [...this.rows.values()].filter(
      (u) => u.role === 'ADMIN' && u.isActive && u.id !== excludingUserId,
    ).length;
  }
  async list(page: number, pageSize: number) {
    const all = [...this.rows.values()];
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
  }
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  rows = new Map<string, StoredRefreshToken & { createdAt: Date }>();
  private seq = 0;
  /** Reloj de creación de filas (simula el `DEFAULT now()` de la BD). */
  now: () => Date = () => new Date();

  async create(input: { userId: number; tokenHash: string; expiresAt: Date }) {
    this.rows.set(input.tokenHash, {
      id: ++this.seq,
      ...input,
      revokedAt: null,
      replacedAt: null,
      createdAt: this.now(),
    });
  }
  async findByHash(tokenHash: string) {
    return this.rows.get(tokenHash) ?? null;
  }
  async revokeIfActive(tokenHash: string, now: Date, options: { replaced?: boolean } = {}) {
    const row = this.rows.get(tokenHash);
    if (!row || row.revokedAt) return false;
    row.revokedAt = now;
    row.replacedAt = options.replaced ? now : null;
    return true;
  }
  async revokeActiveIssuedSince(userId: number, since: Date, now: Date) {
    let count = 0;
    for (const row of this.rows.values()) {
      if (
        row.userId === userId &&
        !row.revokedAt &&
        row.expiresAt > now &&
        row.createdAt >= since
      ) {
        row.revokedAt = now;
        count++;
      }
    }
    return count;
  }
  async deleteStale(cutoff: Date, limit: number) {
    let count = 0;
    for (const [hash, row] of this.rows) {
      if (count >= limit) break;
      if (row.expiresAt < cutoff || (row.revokedAt && row.revokedAt < cutoff)) {
        this.rows.delete(hash);
        count++;
      }
    }
    return count;
  }
  async revokeAllForUser(userId: number, now: Date) {
    for (const row of this.rows.values()) {
      if (row.userId === userId && !row.revokedAt) row.revokedAt = now;
    }
  }
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    DATABASE_URL: 'sqlserver://unused',
    JWT_ACCESS_SECRET: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    JWT_REFRESH_SECRET: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    PORT: 0,
    CORS_ORIGIN: 'http://localhost',
    TZ: 'UTC',
    SCHEDULER_ENABLED: true,
    ...overrides,
  };
}

export async function seedUser(
  repo: UserRepository,
  opts: { email: string; password?: string; role?: UserRole; isActive?: boolean; name?: string },
): Promise<User> {
  const user = User.create({
    email: Email.create(opts.email),
    fullName: opts.name ?? 'Usuario Test',
    passwordHash: await new FakeHasher().hash(opts.password ?? 'pass-12345'),
    role: opts.role ?? 'EJECUTIVO',
    now: new Date('2026-01-01T00:00:00Z'),
  });
  const saved = await repo.save(user);
  if (opts.isActive === false) {
    saved.applyChanges({ isActive: false }, { actorId: -1, otherActiveAdmins: 99 });
    return repo.save(saved);
  }
  return saved;
}

export function makeIssuer(clock: Clock, config = testConfig()) {
  return new JoseTokenIssuer(config, clock);
}
