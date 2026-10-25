import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Global, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { CLOCK, EVENT_BUS, UNIT_OF_WORK } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { ChangeCompanyStatusUseCase, PipelineModule } from '../../../pipeline';
import { ContractsModule } from '../../contracts.module';
import { CONTRACT_READER, CONTRACT_REPOSITORY } from '../../domain';
import { InMemoryContractStore } from '../persistence/in-memory-contracts';

const store = new InMemoryContractStore();
let companyStatus = 'AGENDANDO_CITA';
const NEXT: Record<string, string> = {
  AGENDANDO_CITA: 'EN_PROCESO_CONTRATO',
  EN_PROCESO_CONTRATO: 'CONTRATO_ACTIVO',
};
const fakeChange = {
  async execute(input: { to: string }) {
    if (NEXT[companyStatus] === input.to) {
      companyStatus = input.to;
      return {};
    }
    throw new DomainError('PIPELINE_INVALID_TRANSITION', 'x', 'RULE', {
      from: companyStatus,
      to: input.to,
      allowed: [],
    });
  },
};

@Global()
@Module({
  providers: [
    { provide: UNIT_OF_WORK, useValue: { run: <T>(w: () => Promise<T>) => w() } },
    { provide: EVENT_BUS, useValue: { publishAll: async () => {} } },
    { provide: CLOCK, useValue: { now: () => new Date('2026-10-25T15:00:00Z') } },
  ],
  exports: [UNIT_OF_WORK, EVENT_BUS, CLOCK],
})
class TestSharedModule {}

@Module({
  providers: [{ provide: ChangeCompanyStatusUseCase, useValue: fakeChange }],
  exports: [ChangeCompanyStatusUseCase],
})
class FakePipelineModule {}

let app: INestApplication;
let base: string;

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  const raw = req.header('x-test-user');
  if (raw) (req as Request & { user?: unknown }).user = JSON.parse(raw);
  next();
}

const EXEC = { id: 7, email: 'e@example.test', role: 'EJECUTIVO' };
const OTHER = { id: 8, email: 'o@example.test', role: 'EJECUTIVO' };
const ADMIN = { id: 1, email: 'a@example.test', role: 'ADMIN' };

async function call(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  { user = EXEC as object | null, body }: { user?: object | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (user) headers['x-test-user'] = JSON.stringify(user);
  const res = await fetch(`${base}/api/contracts${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [TestSharedModule, ContractsModule] })
    .overrideModule(PipelineModule)
    .useModule(FakePipelineModule)
    .overrideProvider(CONTRACT_REPOSITORY)
    .useValue(store)
    .overrideProvider(CONTRACT_READER)
    .useValue(store)
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
  store.reset();
  companyStatus = 'AGENDANDO_CITA';
});

const valid = { companyId: 1, startDate: '2026-11-01', endDate: '2027-10-31', amount: '2500.75' };

describe('ContractsController', () => {
  test('401 without a user', async () => {
    const results = await Promise.all([
      call('GET', '', { user: null }),
      call('GET', '/1', { user: null }),
      call('POST', '', { user: null, body: valid }),
      call('PATCH', '/1', { user: null, body: { notes: 'x' } }),
      call('POST', '/1/status', { user: null, body: { to: 'ENVIADO' } }),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
  });

  test('POST creates (201), validates money and dates', async () => {
    const res = await call('POST', '', { body: valid });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      code: 'CT-2026-000001',
      status: 'BORRADOR',
      amount: '2500.75',
      currency: 'NIO',
    });
    expect(companyStatus).toBe('EN_PROCESO_CONTRATO');
    for (const bad of [
      { ...valid, amount: '12.345' },
      { ...valid, amount: 10 },
      { ...valid, endDate: '2026-01-01' },
      { ...valid, currency: 'EUR' },
    ]) {
      const r = await call('POST', '', { body: bad });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_INPUT']);
    }
  });

  test('company not ready maps to 422 with pipeline details', async () => {
    companyStatus = 'CON_RESPUESTA';
    const res = await call('POST', '', { body: valid });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: 'CONTRACT_COMPANY_NOT_READY',
      details: { from: 'CON_RESPUESTA', to: 'EN_PROCESO_CONTRATO' },
    });
  });

  test('PATCH edits drafts, status endpoint walks the lifecycle', async () => {
    await call('POST', '', { body: valid });
    const patched = await call('PATCH', '/1', { body: { amount: '10', endDate: null } });
    expect(patched.body).toMatchObject({ amount: '10.00', endDate: null });
    expect((await call('PATCH', '/1', { body: {} })).status).toBe(400);

    expect((await call('POST', '/1/status', { body: { to: 'ACTIVO' } })).status).toBe(422);
    for (const to of ['ENVIADO', 'FIRMADO', 'ACTIVO']) {
      const r = await call('POST', '/1/status', { body: { to } });
      expect([r.status, r.body.status]).toEqual([200, to]);
    }
    expect(companyStatus).toBe('CONTRATO_ACTIVO');
    expect((await call('PATCH', '/1', { body: { notes: 'x' } })).body.code).toBe(
      'CONTRACT_NOT_DRAFT',
    );
    expect((await call('POST', '/1/status', { body: { to: 'VENCIDO' } })).body.code).toBe(
      'CONTRACT_STATUS_SYSTEM_MANAGED',
    );
  });

  test('GET list / GET :id respect ownership and 404', async () => {
    await call('POST', '', { body: valid });
    expect((await call('GET', '/1')).status).toBe(200);
    expect((await call('GET', '/1', { user: OTHER })).status).toBe(403);
    expect((await call('GET', '/99')).status).toBe(404);
    expect((await call('GET', '', { user: OTHER })).body.total).toBe(0);
    expect((await call('GET', '?status=BORRADOR&companyId=1', { user: ADMIN })).body.total).toBe(1);
    expect((await call('GET', '?status=NOPE')).status).toBe(400);
  });
});
