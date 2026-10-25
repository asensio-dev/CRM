import type { PipelineStatus } from '@axiom/contracts';

/** Vista mínima de una empresa sobre la que se evalúan las especificaciones (repos en memoria). */
export interface CompanySearchable {
  ruc: string;
  legalName: string;
  tradeName: string | null;
  status: PipelineStatus;
  sectorId: number | null;
  activityId: number | null;
  employeeCount: number;
  phone: string | null;
}

/**
 * Visitor que cada adaptador implementa para traducir una especificación a su lenguaje
 * (Prisma `where`, SQL, etc.). El dominio no sabe nada del destino.
 */
export interface CompanySpecificationVisitor<R> {
  visitText(spec: TextMatchSpec): R;
  visitStatusIn(spec: StatusInSpec): R;
  visitSector(spec: SectorSpec): R;
  visitActivity(spec: ActivitySpec): R;
  visitEmployeeRange(spec: EmployeeRangeSpec): R;
  visitHasPhone(spec: HasPhoneSpec): R;
  visitAnd(spec: AndSpec): R;
}

/** Patrón Specification: filtros pequeños, combinables con `and`. */
export abstract class CompanySpecification {
  abstract isSatisfiedBy(company: CompanySearchable): boolean;
  abstract accept<R>(visitor: CompanySpecificationVisitor<R>): R;

  and(other: CompanySpecification): CompanySpecification {
    return new AndSpec([this, other]);
  }
}

/** Compara sin distinguir mayúsculas ni acentos, igual que la collation de la BD. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class TextMatchSpec extends CompanySpecification {
  constructor(readonly text: string) {
    super();
  }
  isSatisfiedBy(c: CompanySearchable): boolean {
    const needle = fold(this.text);
    return [c.ruc, c.legalName, c.tradeName ?? ''].some((f) => fold(f).includes(needle));
  }
  accept<R>(v: CompanySpecificationVisitor<R>): R {
    return v.visitText(this);
  }
}

export class StatusInSpec extends CompanySpecification {
  constructor(readonly statuses: readonly PipelineStatus[]) {
    super();
  }
  isSatisfiedBy(c: CompanySearchable): boolean {
    return this.statuses.includes(c.status);
  }
  accept<R>(v: CompanySpecificationVisitor<R>): R {
    return v.visitStatusIn(this);
  }
}

export class SectorSpec extends CompanySpecification {
  constructor(readonly sectorId: number) {
    super();
  }
  isSatisfiedBy(c: CompanySearchable): boolean {
    return c.sectorId === this.sectorId;
  }
  accept<R>(v: CompanySpecificationVisitor<R>): R {
    return v.visitSector(this);
  }
}

export class ActivitySpec extends CompanySpecification {
  constructor(readonly activityId: number) {
    super();
  }
  isSatisfiedBy(c: CompanySearchable): boolean {
    return c.activityId === this.activityId;
  }
  accept<R>(v: CompanySpecificationVisitor<R>): R {
    return v.visitActivity(this);
  }
}

export class EmployeeRangeSpec extends CompanySpecification {
  constructor(
    readonly min?: number,
    readonly max?: number,
  ) {
    super();
  }
  isSatisfiedBy(c: CompanySearchable): boolean {
    return (
      (this.min === undefined || c.employeeCount >= this.min) &&
      (this.max === undefined || c.employeeCount <= this.max)
    );
  }
  accept<R>(v: CompanySpecificationVisitor<R>): R {
    return v.visitEmployeeRange(this);
  }
}

export class HasPhoneSpec extends CompanySpecification {
  constructor(readonly expected: boolean) {
    super();
  }
  isSatisfiedBy(c: CompanySearchable): boolean {
    return (c.phone !== null && c.phone !== '') === this.expected;
  }
  accept<R>(v: CompanySpecificationVisitor<R>): R {
    return v.visitHasPhone(this);
  }
}

export class AndSpec extends CompanySpecification {
  readonly specs: readonly CompanySpecification[];
  constructor(specs: readonly CompanySpecification[]) {
    super();
    // Aplana ANDs anidados para que `a.and(b).and(c)` produzca una sola lista.
    this.specs = specs.flatMap((s) => (s instanceof AndSpec ? s.specs : [s]));
  }
  isSatisfiedBy(c: CompanySearchable): boolean {
    return this.specs.every((s) => s.isSatisfiedBy(c));
  }
  accept<R>(v: CompanySpecificationVisitor<R>): R {
    return v.visitAnd(this);
  }
}

/** Filtros de búsqueda ya validados (subconjunto de CompanySearchQuery). */
export interface CompanyFilters {
  q?: string;
  status?: readonly PipelineStatus[];
  sectorId?: number;
  activityId?: number;
  minEmployees?: number;
  maxEmployees?: number;
  hasPhone?: boolean;
}

/** Construye la especificación compuesta; sin filtros devuelve un AND vacío (todo satisface). */
export function buildCompanySpecification(filters: CompanyFilters): CompanySpecification {
  const specs: CompanySpecification[] = [];
  const q = filters.q?.trim();
  if (q) specs.push(new TextMatchSpec(q));
  if (filters.status && filters.status.length > 0) specs.push(new StatusInSpec(filters.status));
  if (filters.sectorId !== undefined) specs.push(new SectorSpec(filters.sectorId));
  if (filters.activityId !== undefined) specs.push(new ActivitySpec(filters.activityId));
  if (filters.minEmployees !== undefined || filters.maxEmployees !== undefined) {
    specs.push(new EmployeeRangeSpec(filters.minEmployees, filters.maxEmployees));
  }
  if (filters.hasPhone !== undefined) specs.push(new HasPhoneSpec(filters.hasPhone));
  return new AndSpec(specs);
}
