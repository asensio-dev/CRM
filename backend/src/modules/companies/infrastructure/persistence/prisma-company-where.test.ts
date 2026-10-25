import { describe, expect, test } from 'bun:test';
import { buildCompanySpecification } from '../../domain';
import { toPrismaCompanyWhere } from './prisma-company-where';

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
