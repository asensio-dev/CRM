import { describe, expect, test } from 'bun:test';
import type { BoardDto } from '@axiom/contracts';
import { HttpError } from '@/shared/api';
import { boardQueryString, moveCardInBoard } from './api';
import { isConcurrencyError, pipelineErrorMessage } from './errors';
import { normalizeColumns } from './pipeline-page';
import { pipelineSearchSchema } from './search';

const card = (id: number) => ({
  id,
  legalName: `Empresa ${id}`,
  tradeName: null,
  phone: null,
  employeeCount: 3,
  lastContactAt: null,
});
const board: BoardDto = {
  columns: [
    { status: 'POR_CONTACTAR', count: 50, cards: [card(1), card(2)] },
    { status: 'CONTACTADO', count: 4, cards: [card(3)] },
  ],
};
const err = (statusCode: number, code: string, details?: unknown) =>
  new HttpError({ statusCode, code, message: 'x', details });

describe('pipelineErrorMessage', () => {
  test('mapea cada código a un mensaje en español', () => {
    expect(
      pipelineErrorMessage(
        err(422, 'PIPELINE_INVALID_TRANSITION', {
          from: 'POR_CONTACTAR',
          to: 'CONTRATO_ACTIVO',
          allowed: ['CONTACTADO'],
        }),
      ),
    ).toBe(
      'No se puede pasar de "Por contactar" a "Contrato activo". Estados permitidos: Contactado.',
    );
    expect(pipelineErrorMessage(err(400, 'PIPELINE_NOTE_REQUIRED'))).toContain('motivo');
    expect(pipelineErrorMessage(err(403, 'PIPELINE_REACTIVATION_FORBIDDEN'))).toContain(
      'administrador o supervisor',
    );
    expect(pipelineErrorMessage(err(403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED'))).toContain('cartera');
    expect(pipelineErrorMessage(err(409, 'PIPELINE_CONCURRENT_UPDATE'))).toContain('Otra persona');
    expect(pipelineErrorMessage(err(409, 'PIPELINE_VERSION_MISMATCH'))).toContain('Otra persona');
    expect(pipelineErrorMessage(new Error('boom'))).toContain('inesperado');
  });

  test('detecta errores de concurrencia', () => {
    expect(isConcurrencyError(err(409, 'PIPELINE_VERSION_MISMATCH'))).toBe(true);
    expect(isConcurrencyError(err(422, 'PIPELINE_INVALID_TRANSITION'))).toBe(false);
  });
});

describe('moveCardInBoard', () => {
  test('mueve la tarjeta y ajusta los totales sin mutar el original', () => {
    const next = moveCardInBoard(board, 1, 'CONTACTADO');
    expect(next.columns[0]).toMatchObject({ count: 49, cards: [{ id: 2 }] });
    expect(next.columns[1]).toMatchObject({ count: 5, cards: [{ id: 1 }, { id: 3 }] });
    expect(board.columns[0]?.count).toBe(50);
  });
  test('ignora tarjetas desconocidas', () => {
    expect(moveCardInBoard(board, 99, 'CONTACTADO')).toBe(board);
  });
});

describe('búsqueda y tablero', () => {
  test('normaliza los parámetros de URL', () => {
    expect(pipelineSearchSchema.parse({})).toEqual({ limitPerColumn: 20 });
    expect(pipelineSearchSchema.parse({ q: 123, sectorId: '4', limitPerColumn: 500 })).toEqual({
      q: '123',
      sectorId: 4,
      limitPerColumn: 20,
    });
  });
  test('arma el query string', () => {
    expect(boardQueryString({ q: 'abc', sectorId: 2, limitPerColumn: 40 })).toBe(
      'q=abc&sectorId=2&limitPerColumn=40',
    );
  });
  test('normalizeColumns completa las 8 columnas en orden', () => {
    const cols = normalizeColumns(board);
    expect(cols).toHaveLength(8);
    expect(cols[7]?.status).toBe('DESCARTADO');
    expect(cols[7]?.count).toBe(0);
  });
});
