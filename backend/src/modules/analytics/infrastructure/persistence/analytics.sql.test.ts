import { describe, expect, test } from 'bun:test';
import * as sql from './analytics.sql';

const range = { from: new Date('2026-10-19T06:00:00Z'), to: new Date('2026-10-26T06:00:00Z') };
// Valores "hostiles": si se concatenaran, aparecerían en el texto SQL.
const EVIL_DAY = "2026-10-19'; DROP TABLE users;--";

describe('analytics SQL builders', () => {
  test('filtros del usuario van como parámetros, nunca en el texto', () => {
    const q = sql.reachedByStatusSql({ userId: 4242, sectorId: 7373 }, range);
    expect(q.sql).not.toContain('4242');
    expect(q.sql).not.toContain('7373');
    expect(q.values).toContain(4242);
    expect(q.values).toContain(7373);
    expect(q.values).toContain(range.from);
    expect(q.values).toContain(range.to);
    expect(q.sql).toContain('?');
  });

  test('sin filtros no se añaden JOIN ni condiciones', () => {
    const q = sql.reachedByStatusSql({}, { from: null, to: null });
    expect(q.values).toEqual([]);
    expect(q.sql).not.toContain('JOIN');
    expect(q.sql).not.toContain('WHERE');
  });

  test('texto hostil en el ancla de semana y en el ciclo viaja como parámetro', () => {
    for (const q of [
      sql.weeklyOutcomesSql({}, range, EVIL_DAY),
      sql.weeklyCompaniesSql({}, range, EVIL_DAY),
      sql.weeklyByExecutiveSql({ userId: 1 }, range, EVIL_DAY),
      sql.currentCycleSql(EVIL_DAY),
    ]) {
      expect(q.sql).not.toContain('DROP');
      expect(q.values).toContain(EVIL_DAY);
    }
  });

  test('la semana se calcula con el desfase de Managua como parámetro', () => {
    const q = sql.weeklyOutcomesSql({}, range, '2026-10-19');
    expect(q.values).toContain(-360);
    expect(q.sql).toContain('DATEDIFF(DAY');
    expect(q.sql).toContain('/ 7');
  });

  test('cobertura del ciclo: EXISTS correlacionado con rango y usuario parametrizados', () => {
    const q = sql.contactedInCycleByUserSql({ userId: 9191 }, range);
    expect(q.sql).toContain('EXISTS');
    expect(q.sql).not.toContain('9191');
    expect(q.values).toContain(9191);
    expect(q.values).toContain(range.from);
  });

  test('avances: los rangos del camino principal son parámetros', () => {
    const q = sql.advancesByUserSql({}, range);
    expect(q.values).toContain('CONTRATO_ACTIVO');
    expect(q.values).toContain('DESCARTADO');
    expect(q.sql).not.toContain('CONTRATO_ACTIVO');
  });

  test('citas excluyen canceladas y contratos solo activos (valores parametrizados)', () => {
    expect(sql.appointmentsSql({}, range).values).toContain('CANCELADA');
    expect(sql.activeContractsSql({ sectorId: 3 }).values).toEqual([3, 'ACTIVO']);
  });

  test('ejecutivos activos filtra por rol y estado', () => {
    const q = sql.activeExecutivesSql({ userId: 5 });
    expect(q.values).toEqual(['EJECUTIVO', 5]);
    expect(q.sql).toContain('[isActive] = 1');
  });

  test('cartera del ejecutivo en empresas por estado', () => {
    const q = sql.companiesByStatusSql({ userId: 5, sectorId: 2 });
    expect(q.sql).toContain('portfolio_assignments');
    expect(q.values).toEqual([5, 2]);
  });
});
