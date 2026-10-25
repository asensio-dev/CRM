import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Global, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { CLOCK, EVENT_BUS, UNIT_OF_WORK } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { ChangeCompanyStatusUseCase } from '../../../pipeline';
import { AppointmentsModule } from '../../appointments.module';
import { APPOINTMENT_READER, APPOINTMENT_REPOSITORY } from '../../domain';
import { InMemoryAppointmentStore } from '../../infrastructure/persistence/in-memory-appointments';

const store = new InMemoryAppointmentStore();
let companyStatus = 'CON_RESPUESTA';
const fakeChange = {
  async execute(input: { to: string }) {
    if (companyStatus === 'CON_RESPUESTA') {
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

/** Evita cargar el PipelineModule real (necesita BD): se sustituye por un módulo que exporta el caso de uso falso. */
let app: INestApplication;
let base: string;

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  const raw = req.header('x-test-user');
  if (raw) (req as Request & { user?: unknown }).user = JSON.parse(raw);
  next();
}

const EXEC = { id: 7, email: 'e@example.test', role: 'EJECUTIVO' };
const SUP = { id: 1, email: 's@example.test', role: 'SUPERVISOR' };

async function call(
  method: 'GET' | 'POST',
  path: string,
  { user = EXEC as object | null, body }: { user?: object | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (user) headers['x-test-user'] = JSON.stringify(user);
  const res = await fetch(`${base}/api/appointments${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const { PipelineModule } = await import('../../../pipeline');
  const moduleRef = await Test.createTestingModule({
    imports: [TestSharedModule, AppointmentsModule],
  })
    .overrideModule(PipelineModule)
    .useModule(
      (() => {
        @Module({
          providers: [{ provide: ChangeCompanyStatusUseCase, useValue: fakeChange }],
          exports: [ChangeCompanyStatusUseCase],
        })
        class FakePipelineModule {}
        return FakePipelineModule;
      })(),
    )
    .overrideProvider(APPOINTMENT_REPOSITORY)
    .useValue(store)
    .overrideProvider(APPOINTMENT_READER)
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
  companyStatus = 'CON_RESPUESTA';
});

const valid = { companyId: 1, scheduledAt: '2026-11-02T09:00:00-06:00', mode: 'VIRTUAL' };

describe('AppointmentsController', () => {
  test('401 without a user on every endpoint', async () => {
    const results = await Promise.all([
      call('GET', '', { user: null }),
      call('GET', '/agenda?from=2026-11-01T00:00:00Z&to=2026-11-08T00:00:00Z', { user: null }),
      call('POST', '', { user: null, body: valid }),
      call('POST', '/1/cancel', { user: null, body: {} }),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });

  test('POST schedules (201), moves the pipeline and validates the body', async () => {
    const res = await call('POST', '', { body: valid });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      userId: 7,
      status: 'PROGRAMADA',
      scheduledAt: '2026-11-02T15:00:00.000Z',
    });
    expect(companyStatus).toBe('AGENDANDO_CITA');

    const noLocation = await call('POST', '', { body: { ...valid, mode: 'PRESENCIAL' } });
    expect(noLocation.status).toBe(400);
    expect(noLocation.body.code).toBe('APPOINTMENT_LOCATION_REQUIRED');
    const past = await call('POST', '', {
      body: { ...valid, scheduledAt: '2026-10-01T09:00:00Z' },
    });
    expect(past.body.code).toBe('APPOINTMENT_DATE_IN_PAST');
    expect((await call('POST', '', { body: { ...valid, mode: 'FAX' } })).body.code).toBe(
      'INVALID_INPUT',
    );
  });

  test('reschedule, complete and cancel flow with error mapping', async () => {
    await call('POST', '', { body: valid });
    const re = await call('POST', '/1/reschedule', {
      body: { scheduledAt: '2026-11-09T09:00:00-06:00' },
    });
    expect(re.status).toBe(200);
    expect(re.body).toMatchObject({
      previous: { id: 1, status: 'REPROGRAMADA' },
      appointment: { id: 2, status: 'PROGRAMADA' },
    });
    expect((await call('POST', '/1/cancel', { body: {} })).status).toBe(422);
    expect((await call('POST', '/2/complete', { body: {} })).status).toBe(400);
    const done = await call('POST', '/2/complete', { body: { outcome: 'Firmó carta' } });
    expect(done.body).toMatchObject({ status: 'REALIZADA' });
    expect((await call('POST', '/99/cancel', { body: {} })).status).toBe(404);
  });

  test('list and agenda respect ownership', async () => {
    await call('POST', '', { body: valid });
    await call('POST', '', { user: SUP, body: { ...valid, userId: 1 } });
    const mine = await call('GET', '?page=1');
    expect(mine.body.total).toBe(1);
    expect((await call('GET', '?userId=1')).status).toBe(403);
    expect((await call('GET', '', { user: SUP })).body.total).toBe(2);

    const range = 'from=2026-11-01T00:00:00Z&to=2026-11-08T00:00:00Z';
    const agenda = await call('GET', `/agenda?${range}`);
    expect(agenda.status).toBe(200);
    expect(agenda.body).toHaveLength(1);
    expect((await call('GET', `/agenda?${range}&userId=1`)).status).toBe(403);
    expect(
      (await call('GET', '/agenda?from=2026-11-08T00:00:00Z&to=2026-11-01T00:00:00Z')).status,
    ).toBe(400);
  });
});
