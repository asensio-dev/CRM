import { describe, expect, test } from 'bun:test';
import { DomainError } from '../../../shared/domain';
import { Company, Ruc } from './index';

const validInput = { ruc: ' j031-0000 ', legalName: '  Acme S.A.  ' };

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}`);
}

describe('Ruc', () => {
  test('normalizes the value', () => {
    expect(Ruc.create(' j031-0000 ').value).toBe('J0310000');
    expect(Ruc.create(999000111).value).toBe('999000111');
  });

  test('rejects empty and too long values', () => {
    expectCode(() => Ruc.create('  '), 'COMPANY_RUC_INVALID');
    expectCode(() => Ruc.create('A'.repeat(21)), 'COMPANY_RUC_INVALID');
  });

  test('compares by value', () => {
    expect(Ruc.create('abc').equals(Ruc.create(' ABC '))).toBe(true);
  });
});

describe('Company.create', () => {
  test('starts as POR_CONTACTAR, version 0, source MANUAL', () => {
    const company = Company.create(validInput);
    expect(company.id).toBeNull();
    expect(company.ruc.value).toBe('J0310000');
    expect(company.legalName).toBe('Acme S.A.');
    expect(company.pipeline).toEqual({ status: 'POR_CONTACTAR', version: 0, lastContactAt: null });
    expect(company.source).toBe('MANUAL');
    expect(company.employeeCount).toBe(0);
  });

  test('requires legalName and limits it to 200 characters', () => {
    expectCode(() => Company.create({ ...validInput, legalName: '   ' }), 'COMPANY_FIELD_REQUIRED');
    expectCode(
      () => Company.create({ ...validInput, legalName: 'x'.repeat(201) }),
      'COMPANY_FIELD_TOO_LONG',
    );
    expect(Company.create({ ...validInput, legalName: 'x'.repeat(200) }).legalName).toHaveLength(
      200,
    );
  });

  test('rejects negative or fractional employee counts', () => {
    expectCode(
      () => Company.create({ ...validInput, employeeCount: -1 }),
      'COMPANY_EMPLOYEE_COUNT_INVALID',
    );
    expectCode(
      () => Company.create({ ...validInput, employeeCount: 1.5 }),
      'COMPANY_EMPLOYEE_COUNT_INVALID',
    );
  });

  test('normalizes phones and rejects implausible ones', () => {
    expect(Company.create({ ...validInput, phone: '2999-0011' }).phone).toBe('29990011');
    expect(Company.create({ ...validInput, phone: '' }).phone).toBeNull();
    expectCode(() => Company.create({ ...validInput, phone: '12' }), 'COMPANY_PHONE_INVALID');
  });
});

describe('Company.update', () => {
  test('applies partial changes and clears with null', () => {
    const company = Company.create({ ...validInput, tradeName: 'Acme', phone: '29990011' });
    company.update({ legalName: 'Nueva SA', tradeName: null, employeeCount: 12 });
    expect(company.legalName).toBe('Nueva SA');
    expect(company.tradeName).toBeNull();
    expect(company.employeeCount).toBe(12);
    expect(company.phone).toBe('29990011');
  });

  test('is atomic: an invalid change leaves the company untouched', () => {
    const company = Company.create(validInput);
    expectCode(
      () => company.update({ legalName: 'Otra', employeeCount: -5 }),
      'COMPANY_EMPLOYEE_COUNT_INVALID',
    );
    expect(company.legalName).toBe('Acme S.A.');
  });

  test('never changes the pipeline state or the RUC', () => {
    const company = Company.create(validInput);
    const before = company.pipeline;
    company.update({ legalName: 'Otra' });
    expect(company.pipeline).toEqual(before);
    expect(company.ruc.value).toBe('J0310000');
  });
});

describe('Company.addBranch', () => {
  test('adds a validated branch without id', () => {
    const company = Company.create(validInput);
    const branch = company.addBranch({
      address: ' Managua ',
      phone: '2222-3333',
      employeeCount: 4,
    });
    expect(company.branches).toHaveLength(1);
    expect(branch.id).toBeNull();
    expect(branch.address).toBe('Managua');
    expect(branch.phone).toBe('22223333');
  });

  test('rejects invalid branch data', () => {
    const company = Company.create(validInput);
    expectCode(() => company.addBranch({ employeeCount: -1 }), 'COMPANY_EMPLOYEE_COUNT_INVALID');
    expectCode(() => company.addBranch({ address: 'x'.repeat(301) }), 'COMPANY_FIELD_TOO_LONG');
    expect(company.branches).toHaveLength(0);
  });
});
