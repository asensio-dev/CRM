import { beforeEach, describe, expect, test } from 'bun:test';
import { DomainError } from '../../../../shared/domain';
import { type Actor, DefaultOutcomePolicy } from '../../domain';
import {
  FakeUnitOfWork,
  FixedClock,
  InMemoryCompanyPipelineRepository,
  RecordingEventBus,
} from '../../testing/in-memory-pipeline';
import type { CompanyAccessPolicy } from '../ports/company-access-policy';
import { ChangeCompanyStatusUseCase } from './change-company-status.use-case';
import { RegisterInteractionUseCase } from './register-interaction.use-case';

class OwnedOnly implements CompanyAccessPolicy {
  calls: [Actor, number][] = [];
  constructor(private readonly owned: Set<number>) {}
  async canOperate(actor: Actor, companyId: number) {
    this.calls.push([actor, companyId]);
    return actor.role !== 'EJECUTIVO' || this.owned.has(companyId);
  }
}

const exec: Actor = { userId: 7, role: 'EJECUTIVO' };
let repo: InMemoryCompanyPipelineRepository;
let policy: OwnedOnly;
let changeStatus: ChangeCompanyStatusUseCase;
let register: RegisterInteractionUseCase;
let bus: RecordingEventBus;

beforeEach(() => {
  repo = new InMemoryCompanyPipelineRepository().seed(
    { companyId: 1, status: 'POR_CONTACTAR', version: 0, lastContactAt: null },
    { companyId: 2, status: 'POR_CONTACTAR', version: 0, lastContactAt: null },
  );
  const uow = new FakeUnitOfWork(repo);
  bus = new RecordingEventBus(uow);
  const clock = new FixedClock(new Date('2026-10-24T15:00:00Z'));
  policy = new OwnedOnly(new Set([1]));
  changeStatus = new ChangeCompanyStatusUseCase(repo, uow, bus, clock, policy);
  register = new RegisterInteractionUseCase(
    repo,
    new DefaultOutcomePolicy(),
    uow,
    bus,
    clock,
    policy,
  );
});

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

describe('CompanyAccessPolicy in pipeline use cases', () => {
  test('an executive can operate companies of their portfolio', async () => {
    await changeStatus.execute({ companyId: 1, to: 'CONTACTADO', actor: exec });
    expect(repo.snapshot(1)?.status).toBe('CONTACTADO');
    expect(policy.calls).toEqual([[exec, 1]]);
  });

  test('status change outside the portfolio → 403 PORTFOLIO_COMPANY_NOT_ASSIGNED, nothing written', async () => {
    const error = await rejection(
      changeStatus.execute({ companyId: 2, to: 'CONTACTADO', actor: exec }),
    );
    expect(error.kind).toBe('FORBIDDEN');
    expect(error.code).toBe('PORTFOLIO_COMPANY_NOT_ASSIGNED');
    expect(repo.snapshot(2)?.status).toBe('POR_CONTACTAR');
    expect(bus.published).toEqual([]);
  });

  test('interaction outside the portfolio is rejected; supervisors are unrestricted', async () => {
    const error = await rejection(
      register.execute({ companyId: 2, actor: exec, channel: 'LLAMADA', outcome: 'CONTESTO' }),
    );
    expect(error.code).toBe('PORTFOLIO_COMPANY_NOT_ASSIGNED');
    expect(repo.state.interactions).toHaveLength(0);

    await register.execute({
      companyId: 2,
      actor: { userId: 2, role: 'SUPERVISOR' },
      channel: 'LLAMADA',
      outcome: 'CONTESTO',
    });
    expect(repo.state.interactions).toHaveLength(1);
  });

  test('without a policy the use cases allow everything (default binding)', async () => {
    const uow = new FakeUnitOfWork(repo);
    const open = new ChangeCompanyStatusUseCase(repo, uow, bus, new FixedClock(new Date()));
    await open.execute({ companyId: 2, to: 'CONTACTADO', actor: exec });
    expect(repo.snapshot(2)?.status).toBe('CONTACTADO');
  });
});
