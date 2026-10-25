import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, EVENT_BUS, UNIT_OF_WORK } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import {
  ChangeCompanyStatusUseCase,
  CompanyStatusChanged,
  InteractionRegistered,
  PipelineModule,
} from '../../../pipeline';
// Solo en tests: tokens internos del pipeline para sustituir sus adaptadores Prisma.
import {
  PIPELINE_BOARD_READER,
  PIPELINE_TIMELINE_READER,
} from '../../../pipeline/application/queries/read-ports';
import { COMPANY_PIPELINE_REPOSITORY } from '../../../pipeline/domain';
import {
  FakeUnitOfWork,
  InMemoryCompanyPipelineRepository,
} from '../../../pipeline/testing/in-memory-pipeline';
import { PORTFOLIO_READ_MODEL } from '../../application/queries/read-ports';
import {
  MarkPlanItemContactedUseCase,
  ReleaseOnStatusChangeUseCase,
} from '../../application/use-cases/pipeline-reactions.use-case';
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
import { PipelineEventsSubscriber } from './pipeline-events.subscriber';

describe('PortfolioModule + PipelineModule wiring', () => {
  test('the pipeline use cases receive the portfolio access policy (no circular imports)', async () => {
    const p = inMemoryPortfolio();
    p.world.addUser(10).addCompanies(2);
    p.world.assignments.push({
      id: 1,
      companyId: 1,
      userId: 10,
      cycleId: 1,
      assignedAt: new Date(),
      releasedAt: null,
      releaseReason: null,
      cyclesWithoutProgress: 0,
    });
    const pipelineRepo = new InMemoryCompanyPipelineRepository().seed(
      { companyId: 1, status: 'POR_CONTACTAR', version: 0, lastContactAt: null },
      { companyId: 2, status: 'POR_CONTACTAR', version: 0, lastContactAt: null },
    );

    @Global()
    @Module({
      providers: [
        { provide: UNIT_OF_WORK, useValue: new FakeUnitOfWork(pipelineRepo) },
        { provide: EVENT_BUS, useValue: { publishAll: async () => {} } },
        { provide: CLOCK, useValue: new MutableClock(new Date('2026-10-26T12:00:00Z')) },
      ],
      exports: [UNIT_OF_WORK, EVENT_BUS, CLOCK],
    })
    class TestSharedModule {}

    const ref = await Test.createTestingModule({
      imports: [TestSharedModule, PipelineModule, PortfolioModule],
    })
      .overrideProvider(COMPANY_PIPELINE_REPOSITORY)
      .useValue(pipelineRepo)
      .overrideProvider(PIPELINE_BOARD_READER)
      .useValue({})
      .overrideProvider(PIPELINE_TIMELINE_READER)
      .useValue({})
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

    const change = ref.get(ChangeCompanyStatusUseCase);
    const exec = { userId: 10, role: 'EJECUTIVO' as const };
    await change.execute({ companyId: 1, to: 'CONTACTADO', actor: exec });
    expect(pipelineRepo.snapshot(1)?.status).toBe('CONTACTADO');

    const error = await change
      .execute({ companyId: 2, to: 'CONTACTADO', actor: exec })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('PORTFOLIO_COMPANY_NOT_ASSIGNED');
    expect((error as DomainError).kind).toBe('FORBIDDEN');
    await ref.close();
  });
});

describe('PipelineEventsSubscriber', () => {
  test('routes events to the use cases and never throws', async () => {
    const calls: unknown[] = [];
    const mark = {
      execute: async (input: unknown) => {
        calls.push(['mark', input]);
        return 1;
      },
    } as unknown as MarkPlanItemContactedUseCase;
    const release = {
      execute: async (input: unknown) => {
        calls.push(['release', input]);
        throw new Error('boom');
      },
    } as unknown as ReleaseOnStatusChangeUseCase;
    const subscriber = new PipelineEventsSubscriber(mark, release);
    const at = new Date('2026-10-27T15:00:00Z');

    await subscriber.onInteraction(new InteractionRegistered(5, 10, 'LLAMADA', 'CONTESTO', 77, at));
    await subscriber.onStatusChanged(
      new CompanyStatusChanged(5, 'EN_PROCESO_CONTRATO', 'CONTRATO_ACTIVO', 10, at),
    );

    expect(calls).toEqual([
      ['mark', { companyId: 5, planItemId: 77, occurredAt: at }],
      ['release', { companyId: 5, to: 'CONTRATO_ACTIVO', occurredAt: at }],
    ]);
  });
});
