import { describe, expect, test } from 'bun:test';
import type { MyWeekItemDto } from '@axiom/contracts';
import {
  filterItems,
  parseUserIdParam,
  progressOf,
  reasonCounts,
  sortByPriority,
  tabCounts,
} from './plan-utils';

const item = (id: number, over: Partial<MyWeekItemDto> = {}): MyWeekItemDto => ({
  itemId: id,
  companyId: 100 + id,
  legalName: `Empresa ${id} S.A.`,
  tradeName: null,
  phone: `8888-00${id}`,
  status: 'POR_CONTACTAR',
  reason: 'NUEVA',
  priority: id,
  contactedAt: null,
  lastContactAt: null,
  nextFollowUpAt: null,
  ...over,
});

describe('progressOf', () => {
  test('porcentaje, restantes y cuota alcanzada', () => {
    expect(progressOf(12, 20)).toEqual({
      contacted: 12,
      quota: 20,
      pct: 60,
      remaining: 8,
      reached: false,
    });
    expect(progressOf(1, 3).pct).toBe(33);
  });

  test('al llegar o superar la cuota: 100 %, 0 restantes y reached', () => {
    expect(progressOf(20, 20)).toMatchObject({ pct: 100, remaining: 0, reached: true });
    expect(progressOf(25, 20)).toMatchObject({ pct: 100, remaining: 0, reached: true });
  });

  test('cuota 0 no divide por cero ni cuenta como cumplida', () => {
    expect(progressOf(0, 0)).toMatchObject({ pct: 0, remaining: 0, reached: false });
  });
});

describe('plan', () => {
  const items = [
    item(3, { reason: 'ROTACION' }),
    item(1, { reason: 'SEGUIMIENTO', contactedAt: '2026-10-26T10:00:00.000Z' }),
    item(2, { reason: 'NUEVA', tradeName: 'Ferretería Ñandú' }),
    item(4, { reason: 'REINTENTO' }),
  ];

  test('ordena por prioridad ascendente sin mutar la entrada', () => {
    expect(sortByPriority(items).map((i) => i.itemId)).toEqual([1, 2, 3, 4]);
    expect(items[0]?.itemId).toBe(3);
  });

  test('cuenta por pestaña y por motivo', () => {
    expect(tabCounts(items)).toEqual({ pending: 3, contacted: 1, all: 4 });
    expect(reasonCounts(items)).toEqual({ SEGUIMIENTO: 1, NUEVA: 1, REINTENTO: 1, ROTACION: 1 });
    expect(reasonCounts([])).toEqual({ SEGUIMIENTO: 0, NUEVA: 0, REINTENTO: 0, ROTACION: 0 });
  });

  test('filtra por pestaña', () => {
    expect(filterItems(items, 'pending', '').map((i) => i.itemId)).toEqual([3, 2, 4]);
    expect(filterItems(items, 'contacted', '').map((i) => i.itemId)).toEqual([1]);
    expect(filterItems(items, 'all', '')).toHaveLength(4);
  });

  test('busca por nombre sin acentos ni mayúsculas, y por teléfono', () => {
    expect(filterItems(items, 'all', 'ferreteria nandu').map((i) => i.itemId)).toEqual([2]);
    expect(filterItems(items, 'all', 'empresa 4').map((i) => i.itemId)).toEqual([4]);
    expect(filterItems(items, 'all', '8888-003').map((i) => i.itemId)).toEqual([3]);
    expect(filterItems(items, 'pending', 'empresa 1')).toEqual([]);
  });
});

describe('parseUserIdParam', () => {
  test('acepta enteros positivos (también como texto) e ignora el resto', () => {
    expect(parseUserIdParam(7)).toBe(7);
    expect(parseUserIdParam('7')).toBe(7);
    expect(parseUserIdParam('abc')).toBeUndefined();
    expect(parseUserIdParam(undefined)).toBeUndefined();
    expect(parseUserIdParam('')).toBeUndefined();
    expect(parseUserIdParam(-3)).toBeUndefined();
    expect(parseUserIdParam(1.5)).toBeUndefined();
  });
});
