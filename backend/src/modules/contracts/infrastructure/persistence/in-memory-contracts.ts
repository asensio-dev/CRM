import type { ContractDto, Paginated } from '@axiom/contracts';
import {
  type CalendarDate,
  type Contract,
  type ContractListCriteria,
  type ContractReader,
  type ContractRepository,
  concurrentContractUpdate,
} from '../../domain';
import {
  type ContractRow,
  formatContractCode,
  toAggregate,
  toDbDate,
  toDto,
} from './contract.mapper';

const toRow = (c: Contract): ContractRow => ({
  id: c.id as number,
  companyId: c.companyId,
  code: c.code as string,
  startDate: toDbDate(c.startDate),
  endDate: c.endDate ? toDbDate(c.endDate) : null,
  amount: { toFixed: () => c.amount },
  currency: c.currency,
  status: c.storedStatus,
  notes: c.notes,
  createdById: c.createdById,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/** Repositorio + lector en memoria para tests. */
export class InMemoryContractStore implements ContractRepository, ContractReader {
  rows = new Map<number, ContractRow>();
  companyNames = new Map<number, string>();
  private seq = 0;

  reset(): void {
    this.rows.clear();
    this.seq = 0;
  }

  async findById(id: number): Promise<Contract | null> {
    const row = this.rows.get(id);
    return row ? toAggregate(row) : null;
  }

  async insert(contract: Contract, year: number): Promise<void> {
    const id = ++this.seq;
    contract.assignIdentity(id, formatContractCode(year, id));
    this.rows.set(id, toRow(contract));
  }

  async save(contract: Contract): Promise<void> {
    const current = this.rows.get(contract.id as number);
    if (!current || current.status === 'CANCELADO') throw concurrentContractUpdate();
    this.rows.set(contract.id as number, toRow(contract));
  }

  async getById(id: number, today: CalendarDate): Promise<ContractDto | null> {
    const row = this.rows.get(id);
    return row ? this.dto(row, today) : null;
  }

  async list(c: ContractListCriteria): Promise<Paginated<ContractDto>> {
    const all = [...this.rows.values()]
      .map((r) => this.dto(r, c.today))
      .filter(
        (d) =>
          (c.status === undefined || d.status === c.status) &&
          (c.companyId === undefined || d.companyId === c.companyId) &&
          (c.createdById === undefined || d.createdById === c.createdById) &&
          (!c.startFrom || d.startDate >= c.startFrom) &&
          (!c.startTo || d.startDate <= c.startTo),
      )
      .sort((a, b) => b.id - a.id);
    const start = (c.page - 1) * c.pageSize;
    return {
      items: all.slice(start, start + c.pageSize),
      page: c.page,
      pageSize: c.pageSize,
      total: all.length,
    };
  }

  private dto(row: ContractRow, today: CalendarDate): ContractDto {
    const name = this.companyNames.get(row.companyId);
    return toDto(row, name ? { legalName: name } : null, today);
  }
}
