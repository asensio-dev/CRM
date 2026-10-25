import type {
  ContractDto,
  ContractStatus,
  Paginated,
  PipelineStatus,
  UserRole,
} from '@axiom/contracts';
import type { CalendarDate, Contract } from './contract';

export interface ContractRepository {
  findById(id: number): Promise<Contract | null>;
  /** Inserta y asigna id + código único legible (CT-AAAA-NNNNNN). */
  insert(contract: Contract, year: number): Promise<void>;
  save(contract: Contract): Promise<void>;
}

export interface ContractListCriteria {
  status?: ContractStatus;
  companyId?: number;
  startFrom?: CalendarDate;
  startTo?: CalendarDate;
  /** Restringe a los contratos creados por este usuario (ejecutivos). */
  createdById?: number;
  /** Hoy (YYYY-MM-DD) para evaluar el vencimiento como regla de consulta. */
  today: CalendarDate;
  page: number;
  pageSize: number;
}

export interface ContractReader {
  getById(id: number, today: CalendarDate): Promise<ContractDto | null>;
  list(criteria: ContractListCriteria): Promise<Paginated<ContractDto>>;
}

export interface AdvanceCompanyInput {
  companyId: number;
  target: PipelineStatus;
  /** Si la empresa ya está en alguno de estos estados no se hace nada (no es error). */
  tolerated: readonly PipelineStatus[];
  actor: { userId: number; role: UserRole };
  note?: string;
}

/** Puerto hacia el módulo pipeline (único que escribe `companies.status`). */
export interface CompanyPipelineGateway {
  advance(input: AdvanceCompanyInput): Promise<{ moved: boolean }>;
}

export const CONTRACT_REPOSITORY = Symbol('ContractRepository');
export const CONTRACT_READER = Symbol('ContractReader');
export const COMPANY_PIPELINE_GATEWAY = Symbol('ContractsCompanyPipelineGateway');
