import type { BoardDto, BoardQuery, Paginated, TimelineEntryDto } from '@axiom/contracts';
import type { Clock, EventBus, UnitOfWork } from '../../../shared/application';
import type { DomainEvent } from '../../../shared/domain';
import type {
  PipelineBoardReader,
  PipelineTimelineReader,
} from '../application/queries/read-ports';
import {
  CompanyPipeline,
  type CompanyPipelineRepository,
  concurrentUpdate,
  type InteractionProps,
  type PipelineSnapshot,
  type StatusHistoryEntry,
} from '../domain';

interface State {
  companies: Map<number, PipelineSnapshot>;
  history: (StatusHistoryEntry & { id: number })[];
  interactions: (InteractionProps & { id: number })[];
}

const clone = (s: State): State => ({
  companies: new Map([...s.companies].map(([k, v]) => [k, { ...v }])),
  history: s.history.map((h) => ({ ...h })),
  interactions: s.interactions.map((i) => ({ ...i })),
});

/** Repositorio en memoria con el mismo contrato que el de Prisma (incluido el bloqueo optimista). */
export class InMemoryCompanyPipelineRepository implements CompanyPipelineRepository {
  state: State = { companies: new Map(), history: [], interactions: [] };
  private nextId = 1;
  /** Hook para simular una escritura concurrente justo antes de guardar. */
  beforeSave?: () => void;

  seed(...snapshots: PipelineSnapshot[]): this {
    for (const s of snapshots) this.state.companies.set(s.companyId, { ...s });
    return this;
  }

  snapshot(id: number): PipelineSnapshot | undefined {
    return this.state.companies.get(id);
  }

  async findById(companyId: number): Promise<CompanyPipeline | null> {
    const row = this.state.companies.get(companyId);
    return row ? CompanyPipeline.restore(row) : null;
  }

  async save(pipeline: CompanyPipeline): Promise<void> {
    if (!pipeline.hasChanges) return;
    this.beforeSave?.();
    const row = this.state.companies.get(pipeline.companyId);
    if (!row || row.version !== pipeline.version) throw concurrentUpdate();
    const { history, interactions } = pipeline.pendingChanges();
    this.state.companies.set(pipeline.companyId, {
      companyId: pipeline.companyId,
      status: pipeline.status.value,
      version: row.version + 1,
      lastContactAt: pipeline.lastContactAt,
    });
    for (const i of interactions) this.state.interactions.push({ ...i.props, id: this.nextId++ });
    for (const h of history) this.state.history.push({ ...h, id: this.nextId++ });
    pipeline.markPersisted(row.version + 1);
  }
}

/** UnitOfWork falso: revierte el estado del repositorio si el trabajo falla (como una transacción). */
export class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  committed = 0;
  rolledBack = 0;
  constructor(private readonly repo: InMemoryCompanyPipelineRepository) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs++;
    const backup = clone(this.repo.state);
    try {
      const result = await work();
      this.committed++;
      return result;
    } catch (error) {
      this.repo.state = backup;
      this.rolledBack++;
      throw error;
    }
  }
}

export class RecordingEventBus implements EventBus {
  published: DomainEvent[] = [];
  /** Momento de publicación respecto a los commits de la UoW (para verificar el orden). */
  commitsAtPublish: number[] = [];
  constructor(private readonly uow?: FakeUnitOfWork) {}

  async publishAll(events: DomainEvent[]): Promise<void> {
    this.commitsAtPublish.push(this.uow?.committed ?? -1);
    this.published.push(...events);
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
}

export class StubTimelineReader implements PipelineTimelineReader {
  calls: [number, number, number][] = [];
  constructor(private readonly items: TimelineEntryDto[] = []) {}
  async read(companyId: number, page: number, pageSize: number) {
    this.calls.push([companyId, page, pageSize]);
    return {
      items: this.items,
      page,
      pageSize,
      total: this.items.length,
    } satisfies Paginated<TimelineEntryDto>;
  }
}

export class StubBoardReader implements PipelineBoardReader {
  queries: BoardQuery[] = [];
  async read(query: BoardQuery): Promise<BoardDto> {
    this.queries.push(query);
    return { columns: [] };
  }
}
