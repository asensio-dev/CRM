import { describe, expect, test } from 'bun:test';
import { buildCompanySpecification } from '../../domain';
import { hasTextFilter, toPrismaCompanyWhere, toSqlCompanyWhere } from './prisma-company-where';

describe('toSqlCompanyWhere (búsqueda por texto en una pasada)', () => {
  test('every value is a parameter, never concatenated; LIKE wildcards escaped', () => {
    const evil = "50%_x'; DROP TABLE companies; --";
    const sql = toSqlCompanyWhere(
      buildCompanySpecification({
        q: evil,
        status: ['CONTACTADO', 'SIN_RESPUESTA'],
        sectorId: 2,
        activityId: 7,
        minEmployees: 5,
        maxEmployees: 50,
        hasPhone: true,
      }),
    );
    expect(sql.sql).not.toContain('DROP');
    expect(sql.sql).toContain("ESCAPE '!'");
    expect(sql.sql).toContain('c.[phone] IS NOT NULL');
    expect(sql.values).toEqual([
      `%50!%!_X'; DROP TABLE COMPANIES; --%`,
      'CONTACTADO',
      'SIN_RESPUESTA',
      2,
      7,
      5,
      50,
    ]);
  });

  test('detects text filters (alone or inside AND)', () => {
    expect(hasTextFilter(buildCompanySpecification({}))).toBe(false);
    expect(hasTextFilter(buildCompanySpecification({ sectorId: 1 }))).toBe(false);
    expect(hasTextFilter(buildCompanySpecification({ q: 'acme' }))).toBe(true);
    expect(hasTextFilter(buildCompanySpecification({ q: 'acme', sectorId: 1 }))).toBe(true);
  });
});

describe('toPrismaCompanyWhere', () => {
  test('empty filters produce an empty where', () => {
    expect(toPrismaCompanyWhere(buildCompanySpecification({}))).toEqual({});
  });

  test('translates every filter into an AND clause', () => {
    const where = toPrismaCompanyWhere(
      buildCompanySpecification({
        q: 'acme',
        status: ['CONTACTADO', 'SIN_RESPUESTA'],
        sectorId: 2,
        activityId: 7,
        minEmployees: 5,
        maxEmployees: 50,
        hasPhone: true,
      }),
    );
    expect(where).toEqual({
      AND: [
        { searchText: { contains: 'ACME' } },
        { status: { in: ['CONTACTADO', 'SIN_RESPUESTA'] } },
        { sectorId: 2 },
        { activityId: 7 },
        { employeeCount: { gte: 5, lte: 50 } },
        { phone: { not: null } },
      ],
    });
  });

  test('single status uses equality and hasPhone=false requires null', () => {
    const where = toPrismaCompanyWhere(
      buildCompanySpecification({ status: ['POR_CONTACTAR'], hasPhone: false }),
    );
    expect(where).toEqual({ AND: [{ status: 'POR_CONTACTAR' }, { phone: null }] });
  });
});
