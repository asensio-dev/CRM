import { beforeEach, describe, expect, test } from 'bun:test';
import type { PipelineStatus } from '@axiom/contracts';
import {
  CreateContractSchema,
  MoneyAmountSchema,
  UpdateContractDraftSchema,
} from '@axiom/contracts';
import type { EventBus, UnitOfWork } from '../../../../shared/application';
import { DomainError, type DomainEvent } from '../../../../shared/domain';
import type { ChangeCompanyStatusUseCase } from '../../../pipeline';
import { Contract, normalizeAmount, todayInNicaragua } from '../../domain';
import type { ContractRow } from '../../infrastructure/persistence/contract.mapper';
import { InMemoryContractStore } from '../../infrastructure/persistence/in-memory-contracts';
import { PipelineStatusGateway } from '../../infrastructure/pipeline/pipeline-status.gateway';
import type { ContractActor } from '../actor';
import { ChangeContractStatusUseCase } from './change-contract-status.use-case';
import { GetContractUseCase, ListContractsUseCase } from './contract-queries';
import { CreateContractUseCase } from './create-contract.use-case';
import { UpdateContractDraftUseCase } from './update-contract-draft.use-case';

const NOW = new Date('2026-10-25T15:00:00Z'); // 2026-10-25 en Nicaragua
const clock = { now: () => NOW };
const uow: UnitOfWork = { run: (work) => work() };

class Bus implements EventBus {
  published: DomainEvent[] = [];
  async publishAll(events: DomainEvent[]) {
    this.published.push(...events);
  }
}

const TRANSITIONS: Record<string, PipelineStatus[]> = {
  AGENDANDO_CITA: ['EN_PROCESO_CONTRATO'],
  EN_PROCESO_CONTRATO: ['CONTRATO_ACTIVO'],
};

/** Fake de ChangeCompanyStatusUseCase con las transiciones del pipeline que usa este módulo. */
class FakeChangeStatus {
  statuses = new Map<number, PipelineStatus>();
  async execute(input: { companyId: number; to: PipelineStatus }) {
    const from = this.statuses.get(input.companyId);
    if (!from) throw DomainError.notFound('PIPELINE_COMPANY_NOT_FOUND', 'no existe');
    if (TRANSITIONS[from]?.includes(input.to)) {
      this.statuses.set(input.companyId, input.to);
      return {};
    }
    throw new DomainError('PIPELINE_INVALID_TRANSITION', 'no', 'RULE', {
      from,
      to: input.to,
      allowed: TRANSITIONS[from] ?? [],
    });
  }
}

const EXEC: ContractActor = { userId: 7, role: 'EJECUTIVO' };
const OTHER: ContractActor = { userId: 8, role: 'EJECUTIVO' };
const ADMIN: ContractActor = { userId: 1, role: 'ADMIN' };

const draft = (over: object = {}) =>
  CreateContractSchema.parse({
    companyId: 1,
    startDate: '2026-11-01',
    endDate: '2027-10-31',
    amount: '1500.5',
    ...over,
  });

let store: InMemoryContractStore;
let status: FakeChangeStatus;
let bus: Bus;
let create: CreateContractUseCase;
let update: UpdateContractDraftUseCase;
let change: ChangeContractStatusUseCase;

beforeEach(() => {
  store = new InMemoryContractStore();
  status = new FakeChangeStatus();
  status.statuses.set(1, 'AGENDANDO_CITA');
  bus = new Bus();
  const gateway = new PipelineStatusGateway(status as unknown as ChangeCompanyStatusUseCase);
  create = new CreateContractUseCase(store, store, gateway, uow, bus, clock);
  update = new UpdateContractDraftUseCase(store, store, uow, clock);
  change = new ChangeContractStatusUseCase(store, store, gateway, uow, bus, clock);
});

describe('money and schemas', () => {
  test('amounts are decimal strings, never floats', () => {
    expect(MoneyAmountSchema.parse('1500.5')).toBe('1500.50');
    expect(MoneyAmountSchema.parse('007')).toBe('7.00');
    expect(MoneyAmountSchema.parse('0.1')).toBe('0.10');
    for (const bad of ['-1', '1.234', '1e3', 'abc', '', '1,5'])
      expect(MoneyAmountSchema.safeParse(bad).success).toBe(false);
    expect(MoneyAmountSchema.safeParse(10).success).toBe(false);
    expect(() => normalizeAmount('1.999')).toThrow(DomainError);
  });

  test('create/update schemas validate dates and defaults', () => {
    expect(draft().currency).toBe('NIO');
    expect(CreateContractSchema.safeParse({ ...draft(), endDate: '2026-10-01' }).success).toBe(
      false,
    );
    expect(CreateContractSchema.safeParse({ ...draft(), startDate: '2026-13-01' }).success).toBe(
      false,
    );
    expect(UpdateContractDraftSchema.safeParse({}).success).toBe(false);
    expect(UpdateContractDraftSchema.parse({ endDate: null })).toEqual({ endDate: null });
  });

  test('todayInNicaragua uses UTC-6', () => {
    expect(todayInNicaragua(new Date('2026-10-26T03:00:00Z'))).toBe('2026-10-25');
    expect(todayInNicaragua(new Date('2026-10-26T06:00:00Z'))).toBe('2026-10-26');
  });
});

describe('Contract aggregate', () => {
  const make = () =>
    Contract.create(
      {
        companyId: 1,
        startDate: '2026-11-01',
        endDate: '2027-01-31',
        amount: '10',
        currency: 'USD',
        createdById: 1,
      },
      NOW,
    );

  test('follows BORRADOR → ENVIADO → FIRMADO → ACTIVO and rejects shortcuts', () => {
    const c = make();
    const today = '2026-10-25';
    expect(() => c.changeStatus('FIRMADO', today, NOW)).toThrow(/BORRADOR → FIRMADO/);
    expect(() => c.changeStatus('VENCIDO', today, NOW)).toThrow(/sistema/);
    for (const to of ['ENVIADO', 'FIRMADO', 'ACTIVO'] as const) c.changeStatus(to, today, NOW);
    expect(c.storedStatus).toBe('ACTIVO');
    expect(c.pullEvents().map((e) => e.name)).toEqual([
      'contracts.created',
      'contracts.status-changed',
      'contracts.status-changed',
      'contracts.status-changed',
    ]);
  });

  test('CANCELADO is allowed from any non-final state and is final', () => {
    for (const path of [
      [],
      ['ENVIADO'],
      ['ENVIADO', 'FIRMADO'],
      ['ENVIADO', 'FIRMADO', 'ACTIVO'],
    ] as const) {
      const c = make();
      for (const to of path) c.changeStatus(to, '2026-10-25', NOW);
      c.changeStatus('CANCELADO', '2026-10-25', NOW);
      expect(() => c.changeStatus('ENVIADO', '2026-10-25', NOW)).toThrow(DomainError);
    }
  });

  test('ACTIVO becomes VENCIDO at query time once endDate has passed', () => {
    const c = make();
    for (const to of ['ENVIADO', 'FIRMADO', 'ACTIVO'] as const)
      c.changeStatus(to, '2026-11-01', NOW);
    expect(c.effectiveStatus('2027-01-31')).toBe('ACTIVO');
    expect(c.effectiveStatus('2027-02-01')).toBe('VENCIDO');
    expect(() => c.changeStatus('CANCELADO', '2027-02-01', NOW)).toThrow(/VENCIDO → CANCELADO/);
  });

  test('cannot activate an already expired contract; drafts only are editable', () => {
    const c = make();
    c.changeStatus('ENVIADO', '2026-10-25', NOW);
    c.changeStatus('FIRMADO', '2026-10-25', NOW);
    expect(() => c.changeStatus('ACTIVO', '2027-03-01', NOW)).toThrow(/ya pasó/);
    expect(() => c.updateDraft({ amount: '5' }, NOW)).toThrow(/BORRADOR/);
  });

  test('updateDraft keeps dates coherent', () => {
    const c = make();
    expect(() => c.updateDraft({ startDate: '2027-02-01' }, NOW)).toThrow(/anterior/);
    c.updateDraft({ endDate: null, amount: '99.9' }, NOW);
    expect(c.endDate).toBeNull();
    expect(c.amount).toBe('99.90');
  });
});

describe('CreateContractUseCase', () => {
  test('creates a draft with a readable code and moves the company to EN_PROCESO_CONTRATO', async () => {
    store.companyNames.set(1, 'ACME');
    const dto = await create.execute({ data: draft(), actor: EXEC });
    expect(dto).toMatchObject({
      id: 1,
      code: 'CT-2026-000001',
      status: 'BORRADOR',
      amount: '1500.50',
      currency: 'NIO',
      companyName: 'ACME',
      createdById: 7,
    });
    expect(status.statuses.get(1)).toBe('EN_PROCESO_CONTRATO');
    expect(bus.published.map((e) => e.name)).toEqual(['contracts.created']);
  });

  test('companies already EN_PROCESO_CONTRATO / CONTRATO_ACTIVO keep their status', async () => {
    for (const current of ['EN_PROCESO_CONTRATO', 'CONTRATO_ACTIVO'] as const) {
      status.statuses.set(1, current);
      await create.execute({ data: draft(), actor: EXEC });
      expect(status.statuses.get(1)).toBe(current);
    }
    expect(store.rows.size).toBe(2);
  });

  test('other pipeline states are rejected cleanly and nothing is stored', async () => {
    status.statuses.set(1, 'CON_RESPUESTA');
    const error = await create.execute({ data: draft(), actor: EXEC }).catch((e) => e);
    expect(error).toMatchObject({ code: 'CONTRACT_COMPANY_NOT_READY', kind: 'RULE' });
    expect(error.details).toMatchObject({ from: 'CON_RESPUESTA', to: 'EN_PROCESO_CONTRATO' });
    expect(store.rows.size).toBe(0);
    const missing = await create
      .execute({ data: draft({ companyId: 9 }), actor: EXEC })
      .catch((e) => e);
    expect(missing.code).toBe('PIPELINE_COMPANY_NOT_FOUND');
  });
});

describe('ChangeContractStatusUseCase', () => {
  test('full lifecycle ends with the company in CONTRATO_ACTIVO', async () => {
    const { id } = await create.execute({ data: draft(), actor: EXEC });
    expect((await change.execute({ id, to: 'ENVIADO', actor: EXEC })).status).toBe('ENVIADO');
    expect(status.statuses.get(1)).toBe('EN_PROCESO_CONTRATO');
    await change.execute({ id, to: 'FIRMADO', actor: EXEC });
    expect(status.statuses.get(1)).toBe('EN_PROCESO_CONTRATO');
    const active = await change.execute({ id, to: 'ACTIVO', actor: EXEC });
    expect(active.status).toBe('ACTIVO');
    expect(status.statuses.get(1)).toBe('CONTRATO_ACTIVO');
  });

  test('invalid contract transitions and pipeline refusals surface as domain errors', async () => {
    const { id } = await create.execute({ data: draft(), actor: EXEC });
    const skip = await change.execute({ id, to: 'ACTIVO', actor: EXEC }).catch((e) => e);
    expect(skip).toMatchObject({ code: 'CONTRACT_INVALID_TRANSITION', kind: 'RULE' });
    expect(skip.details.allowed).toEqual(['ENVIADO', 'CANCELADO']);

    await change.execute({ id, to: 'ENVIADO', actor: EXEC });
    await change.execute({ id, to: 'FIRMADO', actor: EXEC });
    status.statuses.set(1, 'AGENDANDO_CITA'); // alguien devolvió la empresa
    const refused = await change.execute({ id, to: 'ACTIVO', actor: EXEC }).catch((e) => e);
    expect(refused.code).toBe('CONTRACT_COMPANY_NOT_READY');
    expect((await store.getById(id, '2026-10-25'))?.status).toBe('FIRMADO'); // sin cambios
  });

  test('ENVIADO re-advances a company that went back to AGENDANDO_CITA', async () => {
    const { id } = await create.execute({ data: draft(), actor: EXEC });
    status.statuses.set(1, 'AGENDANDO_CITA');
    await change.execute({ id, to: 'ENVIADO', actor: EXEC });
    expect(status.statuses.get(1)).toBe('EN_PROCESO_CONTRATO');
  });

  test('cancel does not touch the pipeline; ownership and not-found are enforced', async () => {
    const { id } = await create.execute({ data: draft(), actor: EXEC });
    const denied = await change.execute({ id, to: 'CANCELADO', actor: OTHER }).catch((e) => e);
    expect(denied).toMatchObject({ code: 'CONTRACT_FORBIDDEN', kind: 'FORBIDDEN' });
    const done = await change.execute({ id, to: 'CANCELADO', actor: ADMIN });
    expect(done.status).toBe('CANCELADO');
    expect(status.statuses.get(1)).toBe('EN_PROCESO_CONTRATO');
    const missing = await change.execute({ id: 99, to: 'ENVIADO', actor: ADMIN }).catch((e) => e);
    expect(missing.code).toBe('CONTRACT_NOT_FOUND');
  });
});

describe('UpdateContractDraft / queries', () => {
  test('edits drafts only', async () => {
    const { id } = await create.execute({ data: draft(), actor: EXEC });
    const updated = await update.execute({ id, data: { amount: '20', notes: 'x' }, actor: EXEC });
    expect(updated).toMatchObject({ amount: '20.00', notes: 'x' });
    await change.execute({ id, to: 'ENVIADO', actor: EXEC });
    const error = await update
      .execute({ id, data: { amount: '1.00' }, actor: EXEC })
      .catch((e) => e);
    expect(error.code).toBe('CONTRACT_NOT_DRAFT');
  });

  test('list filters by status (effective), company, dates and scopes executives', async () => {
    const a = await create.execute({
      data: draft({ endDate: '2026-10-01', startDate: '2026-09-01' }),
      actor: EXEC,
    });
    for (const to of ['ENVIADO', 'FIRMADO'] as const)
      await change.execute({ id: a.id, to, actor: EXEC });
    // activar con el reloj del pasado: forzamos el estado almacenado
    store.rows.set(a.id, { ...(store.rows.get(a.id) as ContractRow), status: 'ACTIVO' });
    await create.execute({
      data: draft({ startDate: '2026-12-01', endDate: '2027-12-01' }),
      actor: ADMIN,
    });

    const list = new ListContractsUseCase(store, clock);
    const q = { page: 1, pageSize: 25 };
    expect(
      (await list.execute({ query: { ...q, status: 'VENCIDO' }, actor: ADMIN })).items.map(
        (c) => c.id,
      ),
    ).toEqual([a.id]);
    expect((await list.execute({ query: { ...q, status: 'ACTIVO' }, actor: ADMIN })).total).toBe(0);
    expect((await list.execute({ query: q, actor: ADMIN })).total).toBe(2);
    expect((await list.execute({ query: q, actor: EXEC })).total).toBe(1);
    expect(
      (await list.execute({ query: { ...q, startFrom: '2026-11-01' }, actor: ADMIN })).total,
    ).toBe(1);
    expect((await list.execute({ query: { ...q, companyId: 5 }, actor: ADMIN })).total).toBe(0);

    const get = new GetContractUseCase(store, clock);
    expect((await get.execute({ id: a.id, actor: EXEC })).status).toBe('VENCIDO');
    expect(await get.execute({ id: a.id, actor: OTHER }).catch((e) => e.code)).toBe(
      'CONTRACT_FORBIDDEN',
    );
    expect(await get.execute({ id: 99, actor: ADMIN }).catch((e) => e.code)).toBe(
      'CONTRACT_NOT_FOUND',
    );
  });
});
