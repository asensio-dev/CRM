import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Global, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { CLOCK, EVENT_BUS, UNIT_OF_WORK } from '../../../../shared/application';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import {
  PIPELINE_BOARD_READER,
  PIPELINE_TIMELINE_READER,
} from '../../application/queries/read-ports';
import { COMPANY_PIPELINE_REPOSITORY } from '../../domain';
import { PipelineModule } from '../../pipeline.module';
import {
  FakeUnitOfWork,
  FixedClock,
  InMemoryCompanyPipelineRepository,
  RecordingEventBus,
  StubBoardReader,
  StubTimelineReader,
} from '../../testing/in-memory-pipeline';

const repo = new InMemoryCompanyPipelineRepository();
const uow = new FakeUnitOfWork(repo);
const bus = new RecordingEventBus(uow);
const board = new StubBoardReader();
const timeline = new StubTimelineReader();

/** Sustituye al SharedModule global (sin BD). */
@Global()
@Module({
  providers: [
    { provide: UNIT_OF_WORK, useValue: uow },
    { provide: EVENT_BUS, useValue: bus },
    { provide: CLOCK, useValue: new FixedClock(new Date('2026-10-24T15:00:00Z')) },
  ],
  exports: [UNIT_OF_WORK, EVENT_BUS, CLOCK],
})
class TestSharedModule {}

let app: INestApplication;
let base: string;

/** Simula el guard de identity: el usuario llega en la cabecera `x-test-user`. */
function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  const raw = req.header('x-test-user');
  if (raw) (req as Request & { user?: unknown }).user = JSON.parse(raw);
  next();
}

const EXEC = { id: 7, email: 'exec@example.test', role: 'EJECUTIVO' };
const ADMIN = { id: 1, email: 'admin@example.test', role: 'ADMIN' };

async function call(
  method: 'GET' | 'POST',
  path: string,
  { user = EXEC as object | null, body }: { user?: object | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (user) headers['x-test-user'] = JSON.stringify(user);
  const res = await fetch(`${base}/api/pipeline${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [TestSharedModule, PipelineModule] })
    .overrideProvider(COMPANY_PIPELINE_REPOSITORY)
    .useValue(repo)
    .overrideProvider(PIPELINE_BOARD_READER)
    .useValue(board)
    .overrideProvider(PIPELINE_TIMELINE_READER)
    .useValue(timeline)
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

beforeEach(() => {
  repo.state = { companies: new Map(), history: [], interactions: [] };
  repo.seed(
    { companyId: 1, status: 'POR_CONTACTAR', version: 0, lastContactAt: null },
    { companyId: 3, status: 'DESCARTADO', version: 2, lastContactAt: null },
  );
  bus.published = [];
});

describe('PipelineController', () => {
  test('401 on every endpoint when there is no authenticated user', async () => {
    const results = await Promise.all([
      call('GET', '/companies/1', { user: null }),
      call('GET', '/companies/1/timeline', { user: null }),
      call('GET', '/board', { user: null }),
      call('POST', '/companies/1/status', { user: null, body: { to: 'CONTACTADO' } }),
      call('POST', '/companies/1/interactions', {
        user: null,
        body: { channel: 'LLAMADA', outcome: 'CONTESTO' },
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(repo.state.history).toEqual([]);
  });

  test('GET /companies/:id returns state with role-aware allowed statuses', async () => {
    expect((await call('GET', '/companies/3')).body).toEqual({
      companyId: 3,
      status: 'DESCARTADO',
      version: 2,
      lastContactAt: null,
      allowedNextStatuses: [],
    });
    const admin = await call('GET', '/companies/3', { user: ADMIN });
    expect(admin.body.allowedNextStatuses).toEqual(['POR_CONTACTAR']);
    expect((await call('GET', '/companies/999')).status).toBe(404);
    expect((await call('GET', '/companies/abc')).status).toBe(400);
  });

  test('POST /status moves the company (200) and maps domain errors to HTTP', async () => {
    const ok = await call('POST', '/companies/1/status', {
      body: { to: 'CONTACTADO', expectedVersion: 0 },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'CONTACTADO', version: 1 });
    expect(bus.published.map((e) => e.name)).toEqual(['pipeline.company-status-changed']);

    const invalid = await call('POST', '/companies/1/status', { body: { to: 'CONTRATO_ACTIVO' } });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({
      code: 'PIPELINE_INVALID_TRANSITION',
      details: {
        from: 'CONTACTADO',
        to: 'CONTRATO_ACTIVO',
        allowed: ['SIN_RESPUESTA', 'CON_RESPUESTA', 'DESCARTADO'],
      },
    });

    const stale = await call('POST', '/companies/1/status', {
      body: { to: 'CON_RESPUESTA', expectedVersion: 0 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('PIPELINE_VERSION_MISMATCH');

    const noNote = await call('POST', '/companies/1/status', { body: { to: 'DESCARTADO' } });
    expect(noNote.status).toBe(400);
    expect(noNote.body.code).toBe('PIPELINE_NOTE_REQUIRED');

    const forbidden = await call('POST', '/companies/3/status', { body: { to: 'POR_CONTACTAR' } });
    expect(forbidden.status).toBe(403);

    const badBody = await call('POST', '/companies/1/status', { body: { to: 'GANADO' } });
    expect(badBody.status).toBe(400);
    expect(badBody.body.code).toBe('INVALID_INPUT');
  });

  test('POST /interactions registers the contact (201) and applies the outcome policy', async () => {
    const res = await call('POST', '/companies/1/interactions', {
      body: {
        channel: 'LLAMADA',
        outcome: 'NO_CONTESTO',
        notes: 'Sin respuesta',
        occurredAt: '2026-10-24T08:30:00-06:00',
        nextFollowUpAt: '2026-10-27T09:00:00-06:00',
        planItemId: 5,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      state: {
        companyId: 1,
        status: 'SIN_RESPUESTA',
        version: 1,
        lastContactAt: '2026-10-24T14:30:00.000Z',
        allowedNextStatuses: ['CONTACTADO', 'DESCARTADO'],
      },
      transitions: [
        { from: 'POR_CONTACTAR', to: 'CONTACTADO' },
        { from: 'CONTACTADO', to: 'SIN_RESPUESTA' },
      ],
    });
    expect(repo.state.interactions[0]).toMatchObject({ userId: 7, planItemId: 5 });

    const bad = await call('POST', '/companies/1/interactions', {
      body: { channel: 'FAX', outcome: 'CONTESTO' },
    });
    expect(bad.status).toBe(400);
  });

  test('GET /timeline validates paging and delegates', async () => {
    const res = await call('GET', '/companies/1/timeline?page=2&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
    expect((await call('GET', '/companies/1/timeline?pageSize=500')).status).toBe(400);
  });

  test('GET /board parses filters with defaults', async () => {
    const res = await call('GET', '/board?sectorId=3&q=acme');
    expect(res.status).toBe(200);
    expect(board.queries.at(-1)).toEqual({ sectorId: 3, q: 'acme', limitPerColumn: 20 });
    expect((await call('GET', '/board?limitPerColumn=0')).status).toBe(400);
  });
});
