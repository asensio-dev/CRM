import { describe, expect, test } from 'bun:test';
import { CompanySearchQuerySchema, CreateCompanySchema, UpdateCompanySchema } from './companies';

describe('CompanySearchQuerySchema', () => {
  test('applies defaults', () => {
    const q = CompanySearchQuerySchema.parse({});
    expect(q).toMatchObject({ page: 1, pageSize: 25, sortBy: 'legalName', sortDir: 'asc' });
    expect(q.status).toBeUndefined();
  });

  test('parses status as list from csv, repeated or single values', () => {
    expect(CompanySearchQuerySchema.parse({ status: 'CONTACTADO,SIN_RESPUESTA' }).status).toEqual([
      'CONTACTADO',
      'SIN_RESPUESTA',
    ]);
    expect(CompanySearchQuerySchema.parse({ status: ['CONTACTADO', 'DESCARTADO'] }).status).toEqual(
      ['CONTACTADO', 'DESCARTADO'],
    );
    expect(CompanySearchQuerySchema.parse({ status: 'CONTACTADO' }).status).toEqual(['CONTACTADO']);
  });

  test('coerces numbers and booleans from strings', () => {
    const q = CompanySearchQuerySchema.parse({
      sectorId: '3',
      minEmployees: '0',
      maxEmployees: '10',
      hasPhone: 'false',
    });
    expect(q).toMatchObject({ sectorId: 3, minEmployees: 0, maxEmployees: 10, hasPhone: false });
  });

  test('rejects bad input', () => {
    expect(CompanySearchQuerySchema.safeParse({ status: 'X' }).success).toBe(false);
    expect(
      CompanySearchQuerySchema.safeParse({ minEmployees: '5', maxEmployees: '1' }).success,
    ).toBe(false);
    expect(CompanySearchQuerySchema.safeParse({ sortBy: 'phone' }).success).toBe(false);
  });
});

describe('Create/UpdateCompanySchema', () => {
  test('create normalizes RUC and blanks to null', () => {
    const c = CreateCompanySchema.parse({ ruc: ' j-1 ', legalName: ' Acme ', tradeName: '  ' });
    expect(c).toMatchObject({ ruc: 'J1', legalName: 'Acme', tradeName: null, employeeCount: 0 });
  });

  test('update is partial and strict', () => {
    expect(UpdateCompanySchema.parse({})).toEqual({});
    expect(UpdateCompanySchema.parse({ tradeName: null })).toEqual({ tradeName: null });
    expect(UpdateCompanySchema.safeParse({ ruc: 'X' }).success).toBe(false);
    expect(UpdateCompanySchema.safeParse({ status: 'CONTACTADO' }).success).toBe(false);
    expect(UpdateCompanySchema.safeParse({ employeeCount: -1 }).success).toBe(false);
  });
});
