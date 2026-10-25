import { beforeEach, describe, expect, test } from 'bun:test';
import { CreateBranchSchema, CreateCompanySchema } from '@axiom/contracts';
import type { UnitOfWork } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import type { CompanyAccessPolicy } from '../../../pipeline';
import { InMemoryCompanyRepository } from '../../infrastructure/persistence/in-memory-company.repository';
import { AddCompanyBranchUseCase } from './add-company-branch.use-case';
import { CreateCompanyUseCase } from './create-company.use-case';
import { GetCompanyDetailUseCase } from './get-company-detail.use-case';
import { SearchCompaniesUseCase } from './search-companies.use-case';
import { UpdateCompanyUseCase } from './update-company.use-case';

const uow: UnitOfWork = { run: (work) => work() };

/** Cartera simulada: el EJECUTIVO 7 solo tiene asignadas las empresas de `assigned`. */
const assigned = new Set<number>();
const portfolioPolicy: CompanyAccessPolicy = {
  canOperate: async (actor, companyId) => actor.role !== 'EJECUTIVO' || assigned.has(companyId),
};
const admin = { userId: 1, role: 'ADMIN' as const };
const executive = { userId: 7, role: 'EJECUTIVO' as const };

let repo: InMemoryCompanyRepository;
let create: CreateCompanyUseCase;
let update: UpdateCompanyUseCase;
let addBranch: AddCompanyBranchUseCase;
let detail: GetCompanyDetailUseCase;
let search: SearchCompaniesUseCase;

const input = (ruc: string, extra: Record<string, unknown> = {}) =>
  CreateCompanySchema.parse({ ruc, legalName: `Empresa ${ruc}`, ...extra });

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    return error as DomainError;
  }
  throw new Error('expected rejection');
}

beforeEach(() => {
  repo = new InMemoryCompanyRepository();
  repo.sectors.set(1, 'PRIVADA NACIONAL');
  repo.activities.set(10, 'COMERCIO');
  create = new CreateCompanyUseCase(repo, repo, uow);
  update = new UpdateCompanyUseCase(repo, repo, uow, portfolioPolicy);
  addBranch = new AddCompanyBranchUseCase(repo, uow, portfolioPolicy);
  detail = new GetCompanyDetailUseCase(repo);
  search = new SearchCompaniesUseCase(repo);
});

describe('CreateCompanyUseCase', () => {
  test('creates a manual company in POR_CONTACTAR', async () => {
    const { id } = await create.execute({
      data: input('J001', { sectorId: 1, activityId: 10 }),
      createdById: 7,
    });
    const found = await detail.execute({ id, canViewSensitive: true });
    expect(found.status).toBe('POR_CONTACTAR');
    expect(found.source).toBe('MANUAL');
    expect(found.sectorName).toBe('PRIVADA NACIONAL');
    expect(found.activityName).toBe('COMERCIO');
  });

  test('rejects a duplicated RUC (normalized) with CONFLICT', async () => {
    await create.execute({ data: input('J001') });
    const error = await rejection(create.execute({ data: input(' j-001 ') }));
    expect(error.code).toBe('COMPANY_RUC_DUPLICATED');
    expect(error.kind).toBe('CONFLICT');
  });

  test('rejects unknown sector or activity', async () => {
    const sector = await rejection(create.execute({ data: input('J002', { sectorId: 99 }) }));
    expect(sector.code).toBe('COMPANY_SECTOR_NOT_FOUND');
    const activity = await rejection(create.execute({ data: input('J003', { activityId: 99 }) }));
    expect(activity.code).toBe('COMPANY_ACTIVITY_NOT_FOUND');
  });

  test('propagates domain validation errors', async () => {
    const error = await rejection(create.execute({ data: input('J004', { phone: '1' }) }));
    expect(error.kind).toBe('VALIDATION');
  });
});

describe('UpdateCompanyUseCase', () => {
  test('updates editable fields and keeps the pipeline state', async () => {
    const { id } = await create.execute({ data: input('J010') });
    await update.execute({
      id,
      changes: { legalName: 'Renombrada', employeeCount: 40, sectorId: 1 },
      actor: admin,
    });
    const found = await detail.execute({ id, canViewSensitive: false });
    expect(found.legalName).toBe('Renombrada');
    expect(found.employeeCount).toBe(40);
    expect(found.status).toBe('POR_CONTACTAR');
    expect(found.version).toBe(0);
    expect(found.ruc).toBe('J010');
  });

  test('fails with NOT_FOUND for an unknown company', async () => {
    const error = await rejection(
      update.execute({ id: 999, changes: { legalName: 'x' }, actor: admin }),
    );
    expect(error.kind).toBe('NOT_FOUND');
  });

  test('rejects an unknown catalog reference', async () => {
    const { id } = await create.execute({ data: input('J011') });
    const error = await rejection(
      update.execute({ id, changes: { activityId: 77 }, actor: admin }),
    );
    expect(error.code).toBe('COMPANY_ACTIVITY_NOT_FOUND');
  });
});

describe('AddCompanyBranchUseCase', () => {
  test('adds a branch to an existing company', async () => {
    const { id } = await create.execute({ data: input('J020') });
    await addBranch.execute({
      companyId: id,
      branch: CreateBranchSchema.parse({ address: 'León', employeeCount: 3 }),
      actor: admin,
    });
    const found = await detail.execute({ id, canViewSensitive: true });
    expect(found.branches).toHaveLength(1);
    expect(found.branches[0]?.address).toBe('León');
    expect(found.branches[0]?.id).toBeGreaterThan(0);
  });

  test('fails with NOT_FOUND for an unknown company', async () => {
    const error = await rejection(
      addBranch.execute({ companyId: 5, branch: CreateBranchSchema.parse({}), actor: admin }),
    );
    expect(error.kind).toBe('NOT_FOUND');
  });
});

describe('escritura limitada a la cartera (EJECUTIVO)', () => {
  test('un EJECUTIVO no edita ni añade sucursales a empresas fuera de su cartera', async () => {
    const { id } = await create.execute({ data: input('J030') });
    const edit = await rejection(
      update.execute({ id, changes: { phone: '22220000' }, actor: executive }),
    );
    expect(edit.code).toBe('PORTFOLIO_COMPANY_NOT_ASSIGNED');
    expect(edit.kind).toBe('FORBIDDEN');
    const branch = await rejection(
      addBranch.execute({ companyId: id, branch: CreateBranchSchema.parse({}), actor: executive }),
    );
    expect(branch.code).toBe('PORTFOLIO_COMPANY_NOT_ASSIGNED');
    expect((await detail.execute({ id, canViewSensitive: true })).phone).toBeNull();
  });

  test('sí puede con empresas de su cartera; ADMIN/SUPERVISOR con cualquiera', async () => {
    const { id } = await create.execute({ data: input('J031') });
    assigned.add(id);
    await update.execute({ id, changes: { legalName: 'Mía' }, actor: executive });
    await update.execute({
      id,
      changes: { employeeCount: 3 },
      actor: { userId: 2, role: 'SUPERVISOR' },
    });
    const found = await detail.execute({ id, canViewSensitive: true });
    expect(found.legalName).toBe('Mía');
    expect(found.employeeCount).toBe(3);
  });

  test('empresa inexistente sigue siendo 404 (no 403) para el EJECUTIVO', async () => {
    const error = await rejection(
      update.execute({ id: 4242, changes: { legalName: 'x' }, actor: executive }),
    );
    expect(error.kind).toBe('NOT_FOUND');
  });
});

describe('GetCompanyDetailUseCase', () => {
  test('omits legalRepIdNumber unless the viewer is privileged', async () => {
    const { id } = await create.execute({
      data: input('J030', { legalRepIdNumber: '001-010180-0001A' }),
    });
    const privileged = await detail.execute({ id, canViewSensitive: true });
    const regular = await detail.execute({ id, canViewSensitive: false });
    expect(privileged.legalRepIdNumber).toBe('001-010180-0001A');
    expect('legalRepIdNumber' in regular).toBe(false);
  });

  test('fails with NOT_FOUND', async () => {
    const error = await rejection(detail.execute({ id: 1, canViewSensitive: true }));
    expect(error.code).toBe('COMPANY_NOT_FOUND');
  });
});

describe('SearchCompaniesUseCase', () => {
  const query = (extra: Record<string, unknown> = {}) => ({
    page: 1,
    pageSize: 25,
    sortBy: 'legalName' as const,
    sortDir: 'asc' as const,
    ...extra,
  });

  beforeEach(async () => {
    await create.execute({
      data: input('A1', { legalName: 'Zeta', employeeCount: 5, sectorId: 1, phone: '22223333' }),
    });
    await create.execute({
      data: input('A2', { legalName: 'Alfa', tradeName: 'Café Sol', employeeCount: 50 }),
    });
    await create.execute({
      data: input('B3', { legalName: 'Mega', employeeCount: 20, activityId: 10 }),
    });
  });

  test('paginates and reports the total', async () => {
    const page = await search.execute(query({ pageSize: 2 }));
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.legalName)).toEqual(['Alfa', 'Mega']);
    const second = await search.execute(query({ pageSize: 2, page: 2 }));
    expect(second.items.map((i) => i.legalName)).toEqual(['Zeta']);
  });

  test('sorts by employeeCount descending', async () => {
    const result = await search.execute(query({ sortBy: 'employeeCount', sortDir: 'desc' }));
    expect(result.items.map((i) => i.employeeCount)).toEqual([50, 20, 5]);
  });

  test('combines free text, ranges and phone filters', async () => {
    expect((await search.execute(query({ q: 'cafe' }))).items.map((i) => i.ruc)).toEqual(['A2']);
    expect(
      (await search.execute(query({ minEmployees: 10, maxEmployees: 30 }))).items.map((i) => i.ruc),
    ).toEqual(['B3']);
    expect((await search.execute(query({ hasPhone: true }))).items.map((i) => i.ruc)).toEqual([
      'A1',
    ]);
    expect((await search.execute(query({ hasPhone: false }))).total).toBe(2);
    expect((await search.execute(query({ sectorId: 1, status: ['POR_CONTACTAR'] }))).total).toBe(1);
    expect((await search.execute(query({ status: ['CONTACTADO'] }))).total).toBe(0);
  });

  test('list items never expose the legal rep id number', async () => {
    const result = await search.execute(query());
    for (const item of result.items) expect('legalRepIdNumber' in item).toBe(false);
  });
});
