import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Global, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { CLOCK } from '../../../../shared/application';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { AnalyticsModule } from '../../analytics.module';
import { ANALYTICS_READER } from '../../application/queries/read-ports';
import { FakeAnalyticsReader } from '../../testing/fake-analytics-reader';

const reader = new FakeAnalyticsReader();

@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: { now: () => new Date('2026-10-24T15:00:00Z') } }],
  exports: [CLOCK],
})
class TestSharedModule {}

let app: INestApplication;
let base: string;

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  const raw = req.header('x-test-user');
  if (raw) (req as Request & { user?: unknown }).user = JSON.parse(raw);
  next();
}

const EXEC = { id: 7, email: 'exec@example.test', role: 'EJECUTIVO' };
const ADMIN = { id: 1, email: 'admin@example.test', role: 'ADMIN' };

// biome-ignore lint/suspicious/noExplicitAny: cuerpo JSON arbitrario en tests
type Json = any;

async function get(path: string, user: object | null = ADMIN) {
  const headers: Record<string, string> = {};
  if (user) headers['x-test-user'] = JSON.stringify(user);
  const res = await fetch(`${base}/api/analytics${path}`, { headers });
  return { status: res.status, body: (await res.json()) as Json };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [TestSharedModule, AnalyticsModule],
  })
    .overrideProvider(ANALYTICS_READER)
    .useValue(reader)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use(fakeAuth);
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(0);
  base = await app.getUrl();
});
afterAll(() => app.close());
beforeEach(() => {
  reader.scopes = [];
});

describe('GET /api/analytics', () => {
  test('sin usuario → 401', async () => {
    expect((await get('/summary', null)).status).toBe(401);
  });

  test('summary devuelve los KPIs', async () => {
    const { status, body } = await get('/summary');
    expect(status).toBe(200);
    expect(body.weeklyQuota.compliancePct).toBe(50);
    expect(body.companies.total).toBe(100);
  });

  test('EJECUTIVO: el userId pedido se ignora y se fuerza el propio', async () => {
    const { status } = await get('/summary?userId=8', EXEC);
    expect(status).toBe(200);
    expect(reader.scopes.every((s) => s.userId === 7)).toBe(true);
  });

  test('ADMIN: el filtro userId/sectorId llega al lector', async () => {
    await get('/funnel?userId=8&sectorId=2');
    expect(reader.scopes.every((s) => s.userId === 8 && s.sectorId === 2)).toBe(true);
  });

  test('funnel, executives y cycle-coverage responden 200', async () => {
    expect((await get('/funnel')).body.stages).toHaveLength(8);
    expect((await get('/executives')).body.executives).toHaveLength(2);
    expect((await get('/cycle-coverage')).body.cycle).toBeNull();
  });

  test('weekly-activity respeta weeks y byExecutive', async () => {
    const { status, body } = await get('/weekly-activity?weeks=4&byExecutive=true');
    expect(status).toBe(200);
    expect(body.weeks).toHaveLength(4);
    expect(body.weeks[0].executives).toEqual([]);
  });

  test('parámetros inválidos → 400', async () => {
    expect((await get('/summary?from=ayer')).status).toBe(400);
    expect((await get('/summary?from=2026-10-10&to=2026-10-01')).status).toBe(400);
    expect((await get('/weekly-activity?weeks=0')).status).toBe(400);
    expect((await get('/weekly-activity?weeks=99')).status).toBe(400);
    expect((await get('/executives?userId=abc')).status).toBe(400);
  });
});
