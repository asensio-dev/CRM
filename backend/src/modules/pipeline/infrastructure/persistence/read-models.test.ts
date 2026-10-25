import { describe, expect, test } from 'bun:test';
import { PIPELINE_STATUSES, type TimelineEntryDto } from '@axiom/contracts';
import { buildBoardSql, escapeLike, toBoard } from './prisma-board.reader';
import { compareTimeline } from './prisma-timeline.reader';

describe('board SQL', () => {
  test('no text search → GROUP BY + CROSS APPLY TOP N, only the limit is a parameter', () => {
    const sql = buildBoardSql({ limitPerColumn: 20 });
    expect(sql.values).toEqual([20]);
    expect(sql.sql).toContain('GROUP BY c.[status]');
    expect(sql.sql).toContain('CROSS APPLY');
    expect(sql.sql).toContain('TOP (?)');
    expect(sql.sql).not.toContain('ROW_NUMBER');
  });

  test('catalog filters apply to both the count and the cards', () => {
    const sql = buildBoardSql({ limitPerColumn: 5, sectorId: 3, activityId: 8 });
    expect(sql.values).toEqual([3, 8, 5, 3, 8]);
  });

  test('text search → single window query; values parameterised, never concatenated', () => {
    const q = "x'; DROP TABLE companies; --";
    const sql = buildBoardSql({ limitPerColumn: 5, sectorId: 3, activityId: 8, q });
    expect(sql.values).toEqual([3, 8, `%${q}%`, `%${q}%`, `%${q}%`, 5]);
    expect(sql.sql).toContain('ROW_NUMBER() OVER (PARTITION BY c.[status]');
    expect(sql.sql).toContain('COUNT(*) OVER (PARTITION BY c.[status])');
    expect(sql.sql).not.toContain('DROP TABLE');
    expect(sql.sql).toContain("ESCAPE '!'");
  });

  test('LIKE wildcards in user input are escaped', () => {
    expect(escapeLike('50%_off[1]!')).toBe('50!%!_off![1]!!');
  });

  test('rows are grouped into all 8 columns in pipeline order', () => {
    const board = toBoard([
      {
        id: 1,
        legalName: 'ACME',
        tradeName: null,
        phone: '29990011',
        employeeCount: 10,
        lastContactAt: null,
        status: 'CONTACTADO',
        total: 37n,
      },
      {
        id: 2,
        legalName: 'Beta',
        tradeName: 'B',
        phone: null,
        employeeCount: 0,
        lastContactAt: new Date('2026-10-01T00:00:00Z'),
        status: 'CONTACTADO',
        total: 37n,
      },
    ]);
    expect(board.columns.map((c) => c.status)).toEqual([...PIPELINE_STATUSES]);
    const contactado = board.columns.find((c) => c.status === 'CONTACTADO');
    expect(contactado?.count).toBe(37);
    expect(contactado?.cards.map((c) => c.id)).toEqual([1, 2]);
    expect(contactado?.cards[1]?.lastContactAt).toBe('2026-10-01T00:00:00.000Z');
    expect(board.columns.find((c) => c.status === 'DESCARTADO')).toEqual({
      status: 'DESCARTADO',
      count: 0,
      cards: [],
    });
  });
});

describe('timeline ordering', () => {
  const user = { id: 1, fullName: 'Ana' };
  const interaction = (id: number, at: string): TimelineEntryDto => ({
    type: 'INTERACTION',
    id,
    occurredAt: at,
    user,
    channel: 'LLAMADA',
    outcome: 'CONTESTO',
    notes: null,
    nextFollowUpAt: null,
    planItemId: null,
  });
  const change = (id: number, at: string): TimelineEntryDto => ({
    type: 'STATUS_CHANGE',
    id,
    occurredAt: at,
    user,
    fromStatus: 'POR_CONTACTAR',
    toStatus: 'CONTACTADO',
    note: null,
  });

  test('date desc, status changes before interactions at the same instant, then id desc', () => {
    const t1 = '2026-10-24T10:00:00.000Z';
    const t2 = '2026-10-24T11:00:00.000Z';
    const sorted = [interaction(1, t1), change(5, t2), change(6, t2), interaction(2, t2)].sort(
      compareTimeline,
    );
    expect(sorted.map((e) => `${e.type}:${e.id}`)).toEqual([
      'STATUS_CHANGE:6',
      'STATUS_CHANGE:5',
      'INTERACTION:2',
      'INTERACTION:1',
    ]);
  });
});
