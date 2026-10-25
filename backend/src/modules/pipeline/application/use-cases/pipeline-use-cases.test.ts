import { beforeEach, describe, expect, test } from 'bun:test';
import { DomainError } from '../../../../shared/domain';
import { type Actor, CompanyStatusChanged, DefaultOutcomePolicy } from '../../domain';
import {
  FakeUnitOfWork,
  FixedClock,
  InMemoryCompanyPipelineRepository,
  RecordingEventBus,
  StubBoardReader,
  StubTimelineReader,
} from '../../testing/in-memory-pipeline';
import {
  GetBoardQuery,
  GetPipelineStateQuery,
  GetTimelineQuery,
} from '../queries/pipeline-queries';
import { ChangeCompanyStatusUseCase } from './change-company-status.use-case';
import { RegisterInteractionUseCase } from './register-interaction.use-case';

const now = new Date('2026-10-24T15:00:00Z');
const exec: Actor = { userId: 7, role: 'EJECUTIVO' };
const supervisor: Actor = { userId: 2, role: 'SUPERVISOR' };

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

let repo: InMemoryCompanyPipelineRepository;
let uow: FakeUnitOfWork;
let bus: RecordingEventBus;
let clock: FixedClock;
let changeStatus: ChangeCompanyStatusUseCase;
let register: RegisterInteractionUseCase;

beforeEach(() => {
  repo = new InMemoryCompanyPipelineRepository().seed(
    { companyId: 1, status: 'POR_CONTACTAR', version: 0, lastContactAt: null },
    { companyId: 2, status: 'CON_RESPUESTA', version: 5, lastContactAt: null },
    { companyId: 3, status: 'DESCARTADO', version: 1, lastContactAt: null },
  );
  uow = new FakeUnitOfWork(repo);
  bus = new RecordingEventBus(uow);
  clock = new FixedClock(now);
  changeStatus = new ChangeCompanyStatusUseCase(repo, uow, bus, clock);
  register = new RegisterInteractionUseCase(repo, new DefaultOutcomePolicy(), uow, bus, clock);
});

describe('ChangeCompanyStatusUseCase', () => {
  test('moves the company, persists history, bumps version and publishes after commit', async () => {
    const state = await changeStatus.execute({ companyId: 2, to: 'AGENDANDO_CITA', actor: exec });

    expect(state).toEqual({
      companyId: 2,
      status: 'AGENDANDO_CITA',
      version: 6,
      lastContactAt: null,
      allowedNextStatuses: ['EN_PROCESO_CONTRATO', 'CON_RESPUESTA', 'DESCARTADO'],
    });
    expect(repo.snapshot(2)).toMatchObject({ status: 'AGENDANDO_CITA', version: 6 });
    expect(repo.state.history).toEqual([
      expect.objectContaining({
        companyId: 2,
        userId: 7,
        fromStatus: 'CON_RESPUESTA',
        toStatus: 'AGENDANDO_CITA',
        changedAt: now,
      }),
    ]);
    expect(uow.runs).toBe(1);
    expect(bus.commitsAtPublish).toEqual([1]); // publicado tras el commit
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]).toBeInstanceOf(CompanyStatusChanged);
  });

  test('invalid transition → RULE error, nothing persisted, no events', async () => {
    const error = await rejection(
      changeStatus.execute({ companyId: 1, to: 'CONTRATO_ACTIVO', actor: exec }),
    );
    expect(error.code).toBe('PIPELINE_INVALID_TRANSITION');
    expect(error.kind).toBe('RULE');
    expect(repo.snapshot(1)).toMatchObject({ status: 'POR_CONTACTAR', version: 0 });
    expect(repo.state.history).toEqual([]);
    expect(bus.published).toEqual([]);
    expect(uow.rolledBack).toBe(1);
  });

  test('unknown company → NOT_FOUND', async () => {
    const error = await rejection(
      changeStatus.execute({ companyId: 99, to: 'CONTACTADO', actor: exec }),
    );
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.code).toBe('PIPELINE_COMPANY_NOT_FOUND');
  });

  test('stale expectedVersion → CONFLICT PIPELINE_VERSION_MISMATCH', async () => {
    const error = await rejection(
      changeStatus.execute({ companyId: 2, to: 'AGENDANDO_CITA', expectedVersion: 4, actor: exec }),
    );
    expect(error.kind).toBe('CONFLICT');
    expect(error.code).toBe('PIPELINE_VERSION_MISMATCH');
    const ok = await changeStatus.execute({
      companyId: 2,
      to: 'AGENDANDO_CITA',
      expectedVersion: 5,
      actor: exec,
    });
    expect(ok.version).toBe(6);
  });

  test('optimistic lock: concurrent write between read and save → PIPELINE_CONCURRENT_UPDATE', async () => {
    repo.beforeSave = () => {
      const row = repo.snapshot(2);
      if (row) row.version += 1; // otro usuario guardó primero
      repo.beforeSave = undefined;
    };
    const error = await rejection(
      changeStatus.execute({ companyId: 2, to: 'AGENDANDO_CITA', actor: exec }),
    );
    expect(error.kind).toBe('CONFLICT');
    expect(error.code).toBe('PIPELINE_CONCURRENT_UPDATE');
    expect(repo.state.history).toEqual([]);
    expect(bus.published).toEqual([]);
  });

  test('DESCARTADO requires a note; reactivation requires a privileged role', async () => {
    expect(
      (await rejection(changeStatus.execute({ companyId: 1, to: 'DESCARTADO', actor: exec }))).code,
    ).toBe('PIPELINE_NOTE_REQUIRED');

    const forbidden = await rejection(
      changeStatus.execute({ companyId: 3, to: 'POR_CONTACTAR', actor: exec }),
    );
    expect(forbidden.kind).toBe('FORBIDDEN');

    const state = await changeStatus.execute({
      companyId: 3,
      to: 'POR_CONTACTAR',
      note: 'Reactivada',
      actor: supervisor,
    });
    expect(state.status).toBe('POR_CONTACTAR');
    expect(repo.state.history.at(-1)).toMatchObject({ userId: 2, note: 'Reactivada' });
  });
});

describe('RegisterInteractionUseCase', () => {
  test('first call (NO_CONTESTO) logs interaction + 2 automatic history rows atomically', async () => {
    const result = await register.execute({
      companyId: 1,
      actor: exec,
      channel: 'LLAMADA',
      outcome: 'NO_CONTESTO',
      planItemId: 11,
      nextFollowUpAt: new Date('2026-10-27T15:00:00Z'),
    });

    expect(result.transitions).toEqual([
      { from: 'POR_CONTACTAR', to: 'CONTACTADO' },
      { from: 'CONTACTADO', to: 'SIN_RESPUESTA' },
    ]);
    expect(result.state).toMatchObject({
      status: 'SIN_RESPUESTA',
      version: 1,
      lastContactAt: now.toISOString(),
      allowedNextStatuses: ['CONTACTADO', 'DESCARTADO'],
    });
    expect(repo.state.interactions).toEqual([
      expect.objectContaining({
        companyId: 1,
        userId: 7,
        channel: 'LLAMADA',
        outcome: 'NO_CONTESTO',
        occurredAt: now, // por defecto, el reloj
        planItemId: 11,
      }),
    ]);
    expect(repo.state.history.map((h) => h.toStatus)).toEqual(['CONTACTADO', 'SIN_RESPUESTA']);
    expect(repo.snapshot(1)).toMatchObject({ version: 1, lastContactAt: now });
    expect(uow.runs).toBe(1);
    expect(bus.commitsAtPublish).toEqual([1]);
    expect(bus.published.map((e) => e.name)).toEqual([
      'pipeline.company-status-changed',
      'pipeline.company-status-changed',
      'pipeline.interaction-registered',
    ]);
  });

  test('retry from SIN_RESPUESTA with CONTESTO → CONTACTADO → CON_RESPUESTA', async () => {
    await register.execute({
      companyId: 1,
      actor: exec,
      channel: 'LLAMADA',
      outcome: 'NO_CONTESTO',
    });
    const result = await register.execute({
      companyId: 1,
      actor: exec,
      channel: 'WHATSAPP',
      outcome: 'CONTESTO',
    });
    expect(result.transitions.map((t) => t.to)).toEqual(['CONTACTADO', 'CON_RESPUESTA']);
    expect(result.state.version).toBe(2);
    expect(repo.state.interactions).toHaveLength(2);
    expect(repo.state.history).toHaveLength(4);
  });

  test('later stage: interaction logged, no transition, version still bumps (lastContactAt)', async () => {
    const occurredAt = new Date('2026-10-24T14:00:00Z');
    const result = await register.execute({
      companyId: 2,
      actor: exec,
      channel: 'VISITA',
      outcome: 'CONTESTO',
      occurredAt,
    });
    expect(result.transitions).toEqual([]);
    expect(result.state).toMatchObject({
      status: 'CON_RESPUESTA',
      version: 6,
      lastContactAt: occurredAt.toISOString(),
    });
    expect(repo.state.history).toEqual([]);
    expect(repo.state.interactions).toHaveLength(1);
  });

  test('explicit targetStatus is validated; invalid one rolls everything back', async () => {
    const error = await rejection(
      register.execute({
        companyId: 1,
        actor: exec,
        channel: 'LLAMADA',
        outcome: 'NO_CONTESTO',
        targetStatus: 'AGENDANDO_CITA',
      }),
    );
    expect(error.code).toBe('PIPELINE_INVALID_TRANSITION');
    expect(repo.state.interactions).toEqual([]);
    expect(repo.state.history).toEqual([]);
    expect(repo.snapshot(1)).toMatchObject({
      status: 'POR_CONTACTAR',
      version: 0,
      lastContactAt: null,
    });
    expect(bus.published).toEqual([]);

    const ok = await register.execute({
      companyId: 1,
      actor: exec,
      channel: 'LLAMADA',
      outcome: 'INTERESADO',
      targetStatus: 'AGENDANDO_CITA',
    });
    expect(ok.state.status).toBe('AGENDANDO_CITA');
    expect(ok.transitions).toHaveLength(3);
  });

  test('optimistic-lock conflict rolls back the interaction too', async () => {
    repo.beforeSave = () => {
      const row = repo.snapshot(1);
      if (row) row.version = 9;
    };
    const error = await rejection(
      register.execute({ companyId: 1, actor: exec, channel: 'LLAMADA', outcome: 'CONTESTO' }),
    );
    expect(error.code).toBe('PIPELINE_CONCURRENT_UPDATE');
    expect(repo.state.interactions).toEqual([]);
    expect(bus.published).toEqual([]);
  });

  test('expectedVersion mismatch is rejected before writing', async () => {
    const error = await rejection(
      register.execute({
        companyId: 2,
        actor: exec,
        channel: 'LLAMADA',
        outcome: 'CONTESTO',
        expectedVersion: 0,
      }),
    );
    expect(error.code).toBe('PIPELINE_VERSION_MISMATCH');
    expect(repo.state.interactions).toEqual([]);
  });

  test('unknown company → NOT_FOUND', async () => {
    const error = await rejection(
      register.execute({ companyId: 404, actor: exec, channel: 'OTRO', outcome: 'CONTESTO' }),
    );
    expect(error.kind).toBe('NOT_FOUND');
  });
});

describe('queries', () => {
  test('GetPipelineStateQuery computes allowed statuses for the caller role', async () => {
    const query = new GetPipelineStateQuery(repo);
    expect((await query.execute(3, 'EJECUTIVO')).allowedNextStatuses).toEqual([]);
    expect((await query.execute(3, 'ADMIN')).allowedNextStatuses).toEqual(['POR_CONTACTAR']);
    expect((await rejection(query.execute(99, 'ADMIN'))).kind).toBe('NOT_FOUND');
  });

  test('GetTimelineQuery checks the company exists and delegates paging', async () => {
    const reader = new StubTimelineReader();
    const query = new GetTimelineQuery(repo, reader);
    expect(await query.execute(1, 2, 10)).toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
    expect(reader.calls).toEqual([[1, 2, 10]]);
    expect((await rejection(query.execute(99, 1, 10))).kind).toBe('NOT_FOUND');
  });

  test('GetBoardQuery delegates to the reader', async () => {
    const reader = new StubBoardReader();
    await new GetBoardQuery(reader).execute({ limitPerColumn: 5, q: 'acme' });
    expect(reader.queries).toEqual([{ limitPerColumn: 5, q: 'acme' }]);
  });
});
