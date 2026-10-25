import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { CompanyDetail, CompanyListItem, Paginated } from '@axiom/contracts';
import { bootApp, expectError, type TestApp, uniqueRuc } from '../support/app';
import { createCompany } from '../support/factories';

type CompanyPage = Paginated<CompanyListItem>;

describe('companies', () => {
  let t: TestApp;
  let admin: string;
  let exec: string;

  beforeAll(async () => {
    t = await bootApp();
    admin = (await t.login('admin')).token;
    exec = (await t.login('exec1')).token;
  });
  afterAll(() => t.close());

  test('la búsqueda ignora tildes y ñ usando searchText ("nandu" encuentra «Ñandú»)', async () => {
    for (const q of ['nandu', 'NANDU', 'Ñandú', 'ñandu']) {
      const res = await t.api<CompanyPage>('GET', `/companies?q=${encodeURIComponent(q)}`, {
        token: admin,
      });
      expect(res.status).toBe(200);
      expect(res.body.items.map((c) => c.ruc)).toContain('TST000000001');
    }
  });

  test('busca por RUC, por razón social y por nombre comercial', async () => {
    const byRuc = await t.api<CompanyPage>('GET', '/companies?q=TST000000002', { token: admin });
    expect(byRuc.body.items.map((c) => c.ruc)).toEqual(['TST000000002']);

    const byName = await t.api<CompanyPage>('GET', '/companies?q=sintetica%20007', {
      token: admin,
    });
    expect(byName.body.items.map((c) => c.ruc)).toContain('TST000000007');

    // n % 3 === 0 → nombre comercial «Marca Sintética n»
    const byTrade = await t.api<CompanyPage>('GET', '/companies?q=marca%20sintetica%209', {
      token: admin,
    });
    expect(byTrade.body.items.map((c) => c.ruc)).toContain('TST000000009');
  });

  test('filtros: estado, sector, empleados, teléfono; orden y paginación', async () => {
    const porContactar = await t.api<CompanyPage>(
      'GET',
      '/companies?status=POR_CONTACTAR&pageSize=100',
      {
        token: admin,
      },
    );
    expect(porContactar.body.items.length).toBeGreaterThan(0);
    expect(porContactar.body.items.every((c) => c.status === 'POR_CONTACTAR')).toBe(true);
    expect(porContactar.body.total).toBeGreaterThanOrEqual(300);

    const bigNoPhone = await t.api<CompanyPage>(
      'GET',
      '/companies?minEmployees=100&maxEmployees=300&hasPhone=false&pageSize=100&sortBy=employeeCount&sortDir=desc',
      { token: admin },
    );
    const sizes = bigNoPhone.body.items.map((c) => c.employeeCount);
    expect(bigNoPhone.body.items.every((c) => c.phone === null)).toBe(true);
    expect(sizes.every((n) => n >= 100 && n <= 300)).toBe(true);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));

    const sector = bigNoPhone.body.items[0]?.sectorId;
    const bySector = await t.api<CompanyPage>('GET', `/companies?sectorId=${sector}&pageSize=50`, {
      token: admin,
    });
    expect(bySector.body.items.every((c) => c.sectorId === sector)).toBe(true);

    const page1 = await t.api<CompanyPage>('GET', '/companies?pageSize=10&page=1', {
      token: admin,
    });
    const page2 = await t.api<CompanyPage>('GET', '/companies?pageSize=10&page=2', {
      token: admin,
    });
    expect(page1.body.items).toHaveLength(10);
    const ids1 = new Set(page1.body.items.map((c) => c.id));
    expect(page2.body.items.some((c) => ids1.has(c.id))).toBe(false);
  });

  test('filtros inválidos → 400 (minEmployees > maxEmployees)', async () => {
    expectError(
      await t.api('GET', '/companies?minEmployees=50&maxEmployees=10', { token: admin }),
      400,
      'INVALID_INPUT',
    );
  });

  test('crear con RUC duplicado → 409 COMPANY_RUC_DUPLICATED (también tras normalizar guiones/minúsculas)', async () => {
    const ruc = uniqueRuc('DUP');
    await createCompany(t, admin, { ruc });
    const again = await t.api('POST', '/companies', {
      token: admin,
      body: { ruc: ruc.toLowerCase(), legalName: 'Otra razón social' },
    });
    expectError(again, 409, 'COMPANY_RUC_DUPLICATED');

    const seeded = await t.api('POST', '/companies', {
      token: admin,
      body: { ruc: 'TST-000000003', legalName: 'Copia' },
    });
    expectError(seeded, 409, 'COMPANY_RUC_DUPLICATED');
  });

  test('crear con datos inválidos → 400', async () => {
    expectError(
      await t.api('POST', '/companies', { token: admin, body: { ruc: '', legalName: 'X' } }),
      400,
    );
    expectError(
      await t.api('POST', '/companies', { token: admin, body: { ruc: uniqueRuc() } }),
      400,
    );
  });

  test('la cédula del representante se oculta al EJECUTIVO y se muestra a ADMIN/SUPERVISOR', async () => {
    const company = await createCompany(t, admin, {
      legalRepName: 'Rep',
      legalRepIdNumber: '001-010190-0001A',
    });
    const asAdmin = await t.api<CompanyDetail>('GET', `/companies/${company.id}`, { token: admin });
    expect(asAdmin.body.legalRepIdNumber).toBe('001-010190-0001A');

    const supervisor = (await t.login('supervisor')).token;
    const asSup = await t.api<CompanyDetail>('GET', `/companies/${company.id}`, {
      token: supervisor,
    });
    expect(asSup.body.legalRepIdNumber).toBe('001-010190-0001A');

    const asExec = await t.api<CompanyDetail>('GET', `/companies/${company.id}`, { token: exec });
    expect(asExec.status).toBe(200);
    expect(asExec.body.legalRepName).toBe('Rep');
    expect('legalRepIdNumber' in asExec.body).toBe(false);
    expect(JSON.stringify(asExec.body)).not.toContain('001-010190-0001A');
  });

  test('editar la empresa y agregar una sucursal', async () => {
    const company = await createCompany(t, admin);
    const patched = await t.api<CompanyDetail>('PATCH', `/companies/${company.id}`, {
      token: admin,
      body: { legalName: 'Nombre Editado S.A.', employeeCount: 77, phone: null },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.legalName).toBe('Nombre Editado S.A.');
    expect(patched.body.employeeCount).toBe(77);
    expect(patched.body.phone).toBeNull();

    const withBranch = await t.api<CompanyDetail>('POST', `/companies/${company.id}/branches`, {
      token: admin,
      body: { tradeName: 'Sucursal Norte', address: 'Calle 1', employeeCount: 3 },
    });
    expect(withBranch.status).toBe(201);
    expect(withBranch.body.branches.map((b) => b.tradeName)).toEqual(['Sucursal Norte']);
  });

  test('empresa inexistente → 404 y campos no permitidos en PATCH → 400', async () => {
    expectError(await t.api('GET', '/companies/99999999', { token: admin }), 404);
    const company = await createCompany(t, admin);
    expectError(
      await t.api('PATCH', `/companies/${company.id}`, {
        token: admin,
        body: { status: 'CONTRATO_ACTIVO' },
      }),
      400,
    );
  });

  test('catálogos: sectores y actividades', async () => {
    const sectors = await t.api<{ id: number; name: string }[]>('GET', '/catalogs/sectors', {
      token: exec,
    });
    expect(sectors.body.map((s) => s.name)).toContain('PRIVADA NACIONAL');
    const acts = await t.api<{ id: number; name: string }[]>(
      'GET',
      '/catalogs/activities?q=manufactura',
      { token: exec },
    );
    expect(acts.body.map((a) => a.name)).toEqual(['MANUFACTURA DE PRUEBA']);
  });
});
