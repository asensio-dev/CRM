import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ApiError, CompanyDetail, CompanyListItem, Paginated } from '@axiom/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UNIT_OF_WORK } from '../../../../shared/application';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { COMPANY_ACCESS_POLICY } from '../../../pipeline';
import { AddCompanyBranchUseCase } from '../../application/use-cases/add-company-branch.use-case';
import { CreateCompanyUseCase } from '../../application/use-cases/create-company.use-case';
import { GetCompanyDetailUseCase } from '../../application/use-cases/get-company-detail.use-case';
import { SearchCompaniesUseCase } from '../../application/use-cases/search-companies.use-case';
import { UpdateCompanyUseCase } from '../../application/use-cases/update-company.use-case';
import { COMPANY_READER, COMPANY_WRITER } from '../../domain';
import { InMemoryCompanyRepository } from '../persistence/in-memory-company.repository';
import { CompaniesController } from './companies.controller';

type Body = Partial<CompanyDetail> & Partial<Paginated<CompanyListItem>> & Partial<ApiError>;

let app: INestApplication;
let baseUrl: string;

/** Simula el guard global de auth (que aún no existe): el rol llega en una cabecera de prueba. */
function fakeAuth(
  req: { headers: Record<string, unknown>; user?: unknown },
  _res: unknown,
  next: () => void,
) {
  const role = req.headers['x-test-role'];
  if (typeof role === 'string') req.user = { id: 1, email: 'test@example.com', role };
  next();
}

async function call(method: string, path: string, body?: unknown, role?: string) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(role ? { 'x-test-role': role } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Body };
}

beforeAll(async () => {
  const repo = new InMemoryCompanyRepository();
  repo.sectors.set(1, 'PRIVADA NACIONAL');
  const moduleRef = await Test.createTestingModule({
    controllers: [CompaniesController],
    providers: [
      { provide: COMPANY_READER, useValue: repo },
      { provide: COMPANY_WRITER, useValue: repo },
      // Cartera simulada: el EJECUTIVO de prueba solo tiene asignada la empresa 1
      {
        provide: COMPANY_ACCESS_POLICY,
        useValue: {
          canOperate: async (actor: { role: string }, id: number) =>
            actor.role !== 'EJECUTIVO' || id === 1,
        },
      },
      { provide: UNIT_OF_WORK, useValue: { run: <T>(work: () => Promise<T>) => work() } },
      SearchCompaniesUseCase,
      GetCompanyDetailUseCase,
      CreateCompanyUseCase,
      UpdateCompanyUseCase,
      AddCompanyBranchUseCase,
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  app.use(fakeAuth);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('CompaniesController', () => {
  test('POST creates a company and returns its detail', async () => {
    const res = await call(
      'POST',
      '/companies',
      {
        ruc: ' j-100 ',
        legalName: 'Acme',
        legalRepIdNumber: '001-0001',
        sectorId: 1,
      },
      'ADMIN',
    );
    expect(res.status).toBe(201);
    expect(res.json.ruc).toBe('J100');
    expect(res.json.status).toBe('POR_CONTACTAR');
    expect(res.json.source).toBe('MANUAL');
    expect(res.json.sectorName).toBe('PRIVADA NACIONAL');
    expect(res.json.legalRepIdNumber).toBe('001-0001');
  });

  test('POST with a duplicated RUC answers 409', async () => {
    const res = await call('POST', '/companies', { ruc: 'J100', legalName: 'Otra' }, 'ADMIN');
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('COMPANY_RUC_DUPLICATED');
  });

  test('POST with invalid body answers 400', async () => {
    const res = await call('POST', '/companies', { ruc: '  ', legalName: '' }, 'ADMIN');
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('INVALID_INPUT');
  });

  test('GET detail exposes the cédula only to ADMIN and SUPERVISOR', async () => {
    const admin = await call('GET', '/companies/1', undefined, 'ADMIN');
    const supervisor = await call('GET', '/companies/1', undefined, 'SUPERVISOR');
    const executive = await call('GET', '/companies/1', undefined, 'EJECUTIVO');
    const anonymous = await call('GET', '/companies/1');
    expect(admin.json.legalRepIdNumber).toBe('001-0001');
    expect(supervisor.json.legalRepIdNumber).toBe('001-0001');
    expect('legalRepIdNumber' in executive.json).toBe(false);
    expect('legalRepIdNumber' in anonymous.json).toBe(false);
  });

  test('GET unknown id answers 404 and non-numeric id 400', async () => {
    expect((await call('GET', '/companies/999')).status).toBe(404);
    expect((await call('GET', '/companies/abc')).status).toBe(400);
  });

  test('PATCH updates fields, never the status', async () => {
    const res = await call(
      'PATCH',
      '/companies/1',
      { legalName: 'Acme 2', employeeCount: 8 },
      'EJECUTIVO',
    );
    expect(res.status).toBe(200);
    expect(res.json.legalName).toBe('Acme 2');
    expect(res.json.employeeCount).toBe(8);
    expect(res.json.status).toBe('POR_CONTACTAR');
    expect('legalRepIdNumber' in res.json).toBe(false);
  });

  test('PATCH rejects status and ruc (strict schema)', async () => {
    expect((await call('PATCH', '/companies/1', { status: 'CONTACTADO' })).status).toBe(400);
    expect((await call('PATCH', '/companies/1', { ruc: 'X1' })).status).toBe(400);
  });

  test('POST branches adds a branch', async () => {
    const res = await call(
      'POST',
      '/companies/1/branches',
      { address: 'Masaya', employeeCount: 2 },
      'SUPERVISOR',
    );
    expect(res.status).toBe(201);
    expect(res.json.branches ?? []).toHaveLength(1);
    expect(res.json.branches?.[0]?.address).toBe('Masaya');
  });

  test('GET list parses query params (multi status, booleans, pagination)', async () => {
    await call('POST', '/companies', { ruc: 'J200', legalName: 'Beta', phone: '22223333' });
    const res = await call(
      'GET',
      '/companies?status=POR_CONTACTAR,CONTACTADO&hasPhone=true&sortBy=employeeCount&sortDir=desc&pageSize=10',
    );
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(1);
    expect(res.json.items?.[0]?.ruc).toBe('J200');
    expect(res.json.pageSize).toBe(10);
    expect('legalRepIdNumber' in (res.json.items?.[0] ?? {})).toBe(false);
  });

  test('EJECUTIVO: 403 al editar o añadir sucursal fuera de su cartera; 401 sin usuario', async () => {
    const edit = await call('PATCH', '/companies/2', { phone: '22229999' }, 'EJECUTIVO');
    expect(edit.status).toBe(403);
    expect(edit.json.code).toBe('PORTFOLIO_COMPANY_NOT_ASSIGNED');
    const branch = await call('POST', '/companies/2/branches', { address: 'León' }, 'EJECUTIVO');
    expect(branch.status).toBe(403);
    expect((await call('PATCH', '/companies/2', { phone: '22229999' })).status).toBe(401);
    const admin = await call('PATCH', '/companies/2', { employeeCount: 4 }, 'ADMIN');
    expect(admin.status).toBe(200);
  });

  test('GET list rejects invalid query params', async () => {
    expect((await call('GET', '/companies?status=NOPE')).status).toBe(400);
    expect((await call('GET', '/companies?pageSize=1000')).status).toBe(400);
    expect((await call('GET', '/companies?minEmployees=10&maxEmployees=2')).status).toBe(400);
    expect((await call('GET', '/companies?sortBy=ruc')).status).toBe(400);
  });
});
