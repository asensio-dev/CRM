import type {
  CompanyDetail,
  CompanyListItem,
  CompanySortField,
  Paginated,
  SortDirection,
} from '@axiom/contracts';
import type { Company } from '../entities/company';
import type { CompanySpecification } from '../specifications/company-specification';

export interface CompanySearchCriteria {
  spec: CompanySpecification;
  page: number;
  pageSize: number;
  sortBy: CompanySortField;
  sortDir: SortDirection;
}

/** Lado de lectura (CQRS ligero): devuelve modelos de lectura, no agregados. */
export interface CompanyReader {
  search(criteria: CompanySearchCriteria): Promise<Paginated<CompanyListItem>>;
  /** Detalle con sucursales y nombres de sector/actividad. Incluye la cédula; la capa de aplicación decide si se expone. */
  getDetail(id: number): Promise<CompanyDetail | null>;
  existsByRuc(ruc: string): Promise<boolean>;
  /** Devuelve qué referencia de catálogo no existe, o null si todas existen. */
  findMissingCatalogRef(refs: {
    sectorId?: number | null;
    activityId?: number | null;
  }): Promise<'sector' | 'activity' | null>;
}

/**
 * Lado de escritura. Persiste solo datos propios de la empresa: NUNCA status/version/lastContactAt
 * (los gestiona el módulo `pipeline`).
 */
export interface CompanyWriter {
  findById(id: number): Promise<Company | null>;
  /** Inserta una empresa nueva (con estado inicial) y asigna su id. Lanza CONFLICT si el RUC ya existe. */
  insert(company: Company): Promise<void>;
  /** Actualiza campos editables y crea las sucursales nuevas (sin id). */
  save(company: Company): Promise<void>;
}

export const COMPANY_READER = Symbol('CompanyReader');
export const COMPANY_WRITER = Symbol('CompanyWriter');
