import type { CompanyDetail, CompanyListItem, Paginated } from '@axiom/contracts';
import { DomainError } from '../../../../shared/domain';
import {
  type Company,
  type CompanyReader,
  type CompanySearchable,
  type CompanySearchCriteria,
  type CompanyWriter,
} from '../../domain';

/**
 * Adaptador en memoria de los puertos de empresas: cumple el mismo contrato que Prisma
 * (Liskov) y permite probar casos de uso y controladores sin base de datos.
 */
export class InMemoryCompanyRepository implements CompanyReader, CompanyWriter {
  private readonly rows = new Map<number, Company>();
  private nextId = 1;
  private nextBranchId = 1;
  readonly sectors = new Map<number, string>();
  readonly activities = new Map<number, string>();
  /** Fecha fija para los campos de auditoría. */
  private readonly stamp = new Date('2026-01-01T00:00:00.000Z');

  // ───────── escritura ─────────

  async findById(id: number): Promise<Company | null> {
    return this.rows.get(id) ?? null;
  }

  async insert(company: Company): Promise<void> {
    if (await this.existsByRuc(company.ruc.value)) {
      throw DomainError.conflict('COMPANY_RUC_DUPLICATED', 'RUC duplicado');
    }
    company.assignId(this.nextId++);
    this.rows.set(company.id as number, company);
  }

  async save(company: Company): Promise<void> {
    for (const branch of company.branches) {
      if (branch.id === null) branch.assignId(this.nextBranchId++);
    }
    this.rows.set(company.id as number, company);
  }

  /** Atajo de tests: guarda una empresa ya construida. */
  async seed(company: Company): Promise<Company> {
    await this.insert(company);
    return company;
  }

  // ───────── lectura ─────────

  async existsByRuc(ruc: string): Promise<boolean> {
    return [...this.rows.values()].some((c) => c.ruc.value === ruc);
  }

  async findMissingCatalogRef(refs: {
    sectorId?: number | null;
    activityId?: number | null;
  }): Promise<'sector' | 'activity' | null> {
    if (refs.sectorId != null && !this.sectors.has(refs.sectorId)) return 'sector';
    if (refs.activityId != null && !this.activities.has(refs.activityId)) return 'activity';
    return null;
  }

  async getDetail(id: number): Promise<CompanyDetail | null> {
    const company = this.rows.get(id);
    if (!company) return null;
    return {
      ...this.toListItem(company),
      legalRepName: company.legalRepName,
      legalRepIdNumber: company.legalRepIdNumber,
      shippingAddress: company.shippingAddress,
      particularAddress: company.particularAddress,
      source: company.source,
      version: company.pipeline.version,
      updatedAt: this.stamp.toISOString(),
      branches: company.branches.map((b) => ({
        id: b.id as number,
        tradeName: b.tradeName,
        address: b.address,
        phone: b.phone,
        employeeCount: b.employeeCount,
        createdAt: this.stamp.toISOString(),
      })),
    };
  }

  async search(criteria: CompanySearchCriteria): Promise<Paginated<CompanyListItem>> {
    const matching = [...this.rows.values()].filter((c) =>
      criteria.spec.isSatisfiedBy(this.toSearchable(c)),
    );
    const dir = criteria.sortDir === 'asc' ? 1 : -1;
    const keyOf = (c: Company): string | number => {
      switch (criteria.sortBy) {
        case 'employeeCount':
          return c.employeeCount;
        case 'lastContactAt':
          return c.pipeline.lastContactAt?.getTime() ?? 0;
        case 'createdAt':
          return c.id as number;
        default:
          return c.legalName.toLowerCase();
      }
    };
    matching.sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka < kb) return -dir;
      if (ka > kb) return dir;
      // Desempate por id en la misma dirección (igual que PrismaCompanyReader)
      return ((a.id as number) - (b.id as number)) * dir;
    });
    const start = (criteria.page - 1) * criteria.pageSize;
    return {
      items: matching.slice(start, start + criteria.pageSize).map((c) => this.toListItem(c)),
      page: criteria.page,
      pageSize: criteria.pageSize,
      total: matching.length,
    };
  }

  private toSearchable(c: Company): CompanySearchable {
    return {
      ruc: c.ruc.value,
      legalName: c.legalName,
      tradeName: c.tradeName,
      status: c.pipeline.status,
      sectorId: c.sectorId,
      activityId: c.activityId,
      employeeCount: c.employeeCount,
      phone: c.phone,
    };
  }

  private toListItem(c: Company): CompanyListItem {
    return {
      id: c.id as number,
      ruc: c.ruc.value,
      legalName: c.legalName,
      tradeName: c.tradeName,
      employeeCount: c.employeeCount,
      phone: c.phone,
      status: c.pipeline.status,
      sectorId: c.sectorId,
      sectorName: c.sectorId === null ? null : (this.sectors.get(c.sectorId) ?? null),
      activityId: c.activityId,
      activityName: c.activityId === null ? null : (this.activities.get(c.activityId) ?? null),
      lastContactAt: c.pipeline.lastContactAt?.toISOString() ?? null,
      createdAt: this.stamp.toISOString(),
    };
  }
}
