import { describe, expect, test } from 'bun:test';
import {
  AndSpec,
  buildCompanySpecification,
  type CompanySearchable,
  EmployeeRangeSpec,
  HasPhoneSpec,
  StatusInSpec,
  TextMatchSpec,
} from './company-specification';

const base: CompanySearchable = {
  ruc: 'J9990000000001',
  legalName: 'Compañía Ñandú S.A.',
  tradeName: 'Café Central',
  status: 'POR_CONTACTAR',
  sectorId: 1,
  activityId: 10,
  employeeCount: 25,
  phone: '29990011',
};

describe('company specifications', () => {
  test('text matches ruc, legal name and trade name ignoring case and accents', () => {
    expect(new TextMatchSpec('j999').isSatisfiedBy(base)).toBe(true);
    expect(new TextMatchSpec('compania nandu').isSatisfiedBy(base)).toBe(true);
    expect(new TextMatchSpec('CAFE').isSatisfiedBy(base)).toBe(true);
    expect(new TextMatchSpec('zzz').isSatisfiedBy(base)).toBe(false);
  });

  test('status, employee range and phone filters', () => {
    expect(new StatusInSpec(['CONTACTADO', 'POR_CONTACTAR']).isSatisfiedBy(base)).toBe(true);
    expect(new StatusInSpec(['CONTACTADO']).isSatisfiedBy(base)).toBe(false);
    expect(new EmployeeRangeSpec(30, undefined).isSatisfiedBy(base)).toBe(false);
    expect(new EmployeeRangeSpec(undefined, 25).isSatisfiedBy(base)).toBe(true);
    expect(new HasPhoneSpec(false).isSatisfiedBy({ ...base, phone: null })).toBe(true);
    expect(new HasPhoneSpec(true).isSatisfiedBy({ ...base, phone: null })).toBe(false);
  });

  test('and() composes and flattens', () => {
    const spec = new TextMatchSpec('cafe')
      .and(new StatusInSpec(['POR_CONTACTAR']))
      .and(new EmployeeRangeSpec(10, 50));
    expect(spec).toBeInstanceOf(AndSpec);
    expect((spec as AndSpec).specs).toHaveLength(3);
    expect(spec.isSatisfiedBy(base)).toBe(true);
    expect(spec.isSatisfiedBy({ ...base, employeeCount: 99 })).toBe(false);
  });

  test('buildCompanySpecification only includes the provided filters', () => {
    expect((buildCompanySpecification({}) as AndSpec).specs).toHaveLength(0);
    expect(buildCompanySpecification({}).isSatisfiedBy(base)).toBe(true);

    const spec = buildCompanySpecification({
      q: '  cafe ',
      status: ['POR_CONTACTAR'],
      sectorId: 1,
      activityId: 11,
      hasPhone: true,
    });
    expect((spec as AndSpec).specs).toHaveLength(5);
    expect(spec.isSatisfiedBy(base)).toBe(false); // activityId distinto
    expect(buildCompanySpecification({ sectorId: 1, activityId: 10 }).isSatisfiedBy(base)).toBe(
      true,
    );
  });

  test('ignores blank q and empty status lists', () => {
    expect((buildCompanySpecification({ q: '   ', status: [] }) as AndSpec).specs).toHaveLength(0);
  });
});
