import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Global, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { CLOCK, EVENT_BUS, UNIT_OF_WORK } from '../../../../shared/application';
import { APP_CONFIG } from '../../../../shared/infrastructure/config/env';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { PORTFOLIO_READ_MODEL } from '../../application/queries/read-ports';
import {
  ASSIGNMENT_REPOSITORY,
  CYCLE_EVIDENCE_READER,
  CYCLE_REPOSITORY,
  EXECUTIVE_DIRECTORY,
  PLAN_CANDIDATE_READER,
  POOL_READER,
  PORTFOLIO_SETTINGS,
  WEEKLY_PLAN_REPOSITORY,
} from '../../domain';
import { PortfolioModule } from '../../portfolio.module';
import { inMemoryPortfolio, MutableClock } from '../../testing/in-memory-portfolio';

const p = inMemoryPortfolio();
p.world.addUser(1, 'ADMIN').addUser(2, 'SUPERVISOR').addUser(10).addUser(11);
for (let i = 1; i <= 150; i++) p.world.addCompanies(1, { employeeCount: i }, i);

@Global()
@Module({
  providers: [
    { provide: UNIT_OF_WORK, useValue: p.uow },
    { provide: EVENT_BUS, useValue: { publishAll: async () => {} } },
    { provide: CLOCK, useValue: new MutableClock(new Date('2026-10-26T12:00:00Z')) },
    { provide: APP_CONFIG, useValue: { SCHEDULER_ENABLED: false } },
  ],
  exports: [UNIT_OF_WORK, EVENT_BUS, CLOCK, APP_CONFIG],
})
class TestSharedModule {}

const ADMIN = { id: 1, email: 'admin@example.test', role: 'ADMIN' };
const SUPERVISOR = { id: 2, email: 'sup@example.test', role: 'SUPERVISOR' };
const EXEC = { id: 10, email: 'exec@example.test', role: 'EJECUTIVO' };

let app: INestApplication;
let base: string;

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  const raw = req.header('x-test-user');
  if (raw) (req as Request & { user?: unknown }).user = JSON.parse(raw);
  next();
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  { user = EXEC as object | null, body }: { user?: object | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (user) headers['x-test-user'] = JSON.stringify(user);
  const res = await fetch(`${base}/api/portfolio${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuesta JSON libre en el test
  return { status: res.status, body: (await res.json()) as any };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [TestSharedModule, PortfolioModule] })
    .overrideProvider(PORTFOLIO_SETTINGS)
    .useValue(p.settings)
    .overrideProvider(CYCLE_REPOSITORY)
    .useValue(p.cycles)
    .overrideProvider(ASSIGNMENT_REPOSITORY)
    .useValue(p.assignments)
    .overrideProvider(WEEKLY_PLAN_REPOSITORY)
    .useValue(p.plans)
    .overrideProvider(EXECUTIVE_DIRECTORY)
    .useValue(p.directory)
    .overrideProvider(POOL_READER)
    .useValue(p.pool)
    .overrideProvider(PLAN_CANDIDATE_READER)
    .useValue(p.candidates)
    .overrideProvider(CYCLE_EVIDENCE_READER)
    .useValue(p.evidence)
    .overrideProvider(PORTFOLIO_READ_MODEL)
    .useValue(p.read)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use(fakeAuth);
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});

afterAll(async () => {
  await app.close();
});

describe('PortfolioController', () => {
  test('401 without user', async () => {
    expect((await call('GET', '/my-week', { user: null })).status).toBe(401);
  });

  test('my-week before any cycle is empty', async () => {
    const res = await call('GET', '/my-week');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 10, week: null, items: [], quota: 20 });
  });

  test('run-weekly is ADMIN only', async () => {
    expect((await call('POST', '/run-weekly', { user: SUPERVISOR })).body.code).toBe(
      'PORTFOLIO_FORBIDDEN',
    );
    const res = await call('POST', '/run-weekly', { user: ADMIN });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      openedCycle: 1,
      week: { weekNumber: 1, totalWeeks: 3, weekStart: '2026-10-26' },
      refill: { executives: 2, assigned: 120, shortfall: 0 },
      plans: { generated: 2, items: 40 },
    });
  });

  test('my-week returns the plan; executives cannot query others', async () => {
    const res = await call('GET', '/my-week');
    expect(res.body.totalItems).toBe(20);
    expect(res.body.items[0]).toMatchObject({ priority: 1, reason: 'NUEVA', contactedAt: null });
    expect((await call('GET', '/my-week?userId=11')).status).toBe(403);
    expect((await call('GET', '/my-week?userId=11', { user: SUPERVISOR })).body.userId).toBe(11);
    expect((await call('GET', '/my-week?userId=abc', { user: SUPERVISOR })).status).toBe(400);
  });

  test('cycles/current shows coverage per executive', async () => {
    const res = await call('GET', '/cycles/current', { user: SUPERVISOR });
    expect(res.body.week.cycle.number).toBe(1);
    expect(res.body.executives).toHaveLength(2);
    expect(res.body.executives[0]).toMatchObject({ assigned: 60, target: 60, coveragePct: 0 });
  });

  test('assignments list, reassign and release', async () => {
    const list = await call('GET', '/assignments?pageSize=5', { user: SUPERVISOR });
    expect(list.body).toMatchObject({ total: 120, pageSize: 5 });
    const own = await call('GET', '/assignments?userId=11');
    expect(own.status).toBe(403);

    const companyId = p.world.active().find((a) => a.userId === 10)?.companyId as number;
    const moved = await call('POST', '/assignments/reassign', {
      user: SUPERVISOR,
      body: { companyIds: [companyId], toUserId: 11 },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.assigned).toEqual([companyId]);
    expect(
      (await call('POST', '/assignments/reassign', { body: { companyIds: [1], toUserId: 10 } }))
        .status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/assignments/reassign', {
          user: SUPERVISOR,
          body: { companyIds: [], toUserId: 10 },
        })
      ).status,
    ).toBe(400);

    const id = p.world.active().find((a) => a.companyId === companyId)?.id as number;
    const released = await call('POST', `/assignments/${id}/release`, { user: ADMIN, body: {} });
    expect(released.body.released).toEqual([id]);
    expect((await call('POST', `/assignments/${id}/release`, { user: ADMIN })).status).toBe(422);
  });

  test('bulk assign from the pool', async () => {
    const res = await call('POST', '/assignments/bulk', {
      user: SUPERVISOR,
      body: { filters: { minEmployees: 1 }, toUserId: 11, limit: 3 },
    });
    expect(res.status).toBe(200);
    expect(res.body.assigned).toHaveLength(3);
    expect(
      (
        await call('POST', '/assignments/bulk', {
          user: SUPERVISOR,
          body: { toUserId: 2, limit: 3 },
        })
      ).body.code,
    ).toBe('PORTFOLIO_TARGET_NOT_EXECUTIVE');
  });
});
