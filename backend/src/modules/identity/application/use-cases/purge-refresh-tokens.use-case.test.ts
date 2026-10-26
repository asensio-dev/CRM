import { describe, expect, test } from 'bun:test';
import { RefreshTokenPurgeScheduler } from '../../infrastructure/scheduling/refresh-token-purge.scheduler';
import { FakeClock, InMemoryRefreshTokenRepository, testConfig } from '../../test-support';
import { PurgeRefreshTokensUseCase } from './purge-refresh-tokens.use-case';

const DAY = 24 * 60 * 60 * 1000;

async function seed(repo: InMemoryRefreshTokenRepository, clock: FakeClock) {
  const now = clock.now();
  const add = async (hash: string, expiresAt: Date) =>
    repo.create({ userId: 1, tokenHash: hash, expiresAt });
  await add('caducado-hace-40d', new Date(now.getTime() - 40 * DAY));
  await add('caducado-hace-10d', new Date(now.getTime() - 10 * DAY));
  await add('activo', new Date(now.getTime() + 5 * DAY));
  await add('revocado-hace-40d', new Date(now.getTime() + 5 * DAY));
  await add('revocado-hace-5d', new Date(now.getTime() + 5 * DAY));
  await repo.revokeIfActive('revocado-hace-40d', new Date(now.getTime() - 40 * DAY));
  await repo.revokeIfActive('revocado-hace-5d', new Date(now.getTime() - 5 * DAY));
}

describe('PurgeRefreshTokensUseCase', () => {
  test('borra caducados/revocados de hace más de 30 días y conserva el resto', async () => {
    const clock = new FakeClock();
    const repo = new InMemoryRefreshTokenRepository();
    await seed(repo, clock);

    const result = await new PurgeRefreshTokensUseCase(repo, clock).execute();

    expect(result.deleted).toBe(2);
    expect([...repo.rows.keys()].sort()).toEqual([
      'activo',
      'caducado-hace-10d',
      'revocado-hace-5d',
    ]);
  });

  test('trabaja por lotes hasta vaciar lo purgable', async () => {
    const clock = new FakeClock();
    const repo = new InMemoryRefreshTokenRepository();
    const old = new Date(clock.now().getTime() - 60 * DAY);
    for (let i = 0; i < 7; i++)
      await repo.create({ userId: 1, tokenHash: `old-${i}`, expiresAt: old });
    await repo.create({
      userId: 1,
      tokenHash: 'vigente',
      expiresAt: new Date(clock.now().getTime() + DAY),
    });

    const calls: number[] = [];
    const original = repo.deleteStale.bind(repo);
    repo.deleteStale = async (cutoff, limit) => {
      const n = await original(cutoff, limit);
      calls.push(n);
      return n;
    };

    const result = await new PurgeRefreshTokensUseCase(repo, clock).execute({ batchSize: 3 });

    expect(result.deleted).toBe(7);
    expect(calls).toEqual([3, 3, 1]);
    expect([...repo.rows.keys()]).toEqual(['vigente']);
  });
});

describe('RefreshTokenPurgeScheduler y SCHEDULER_ENABLED', () => {
  test('solo purga cuando está habilitado', async () => {
    let runs = 0;
    const purge = {
      execute: async () => {
        runs++;
        return { deleted: 0 };
      },
    } as unknown as PurgeRefreshTokensUseCase;

    await new RefreshTokenPurgeScheduler(purge, testConfig({ SCHEDULER_ENABLED: false })).handle();
    expect(runs).toBe(0);
    await new RefreshTokenPurgeScheduler(purge, testConfig({ SCHEDULER_ENABLED: true })).handle();
    expect(runs).toBe(1);
  });
});
