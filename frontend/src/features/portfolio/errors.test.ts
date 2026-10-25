import { describe, expect, test } from 'bun:test';
import { HttpError } from '@/shared/api';
import { portfolioErrorMessage } from './errors';

const err = (code: string, statusCode = 422, message = 'mensaje del servidor') =>
  new HttpError({ statusCode, code, message });

describe('portfolioErrorMessage', () => {
  test.each([
    ['PORTFOLIO_FORBIDDEN', /No tienes permiso/],
    ['PORTFOLIO_TARGET_NOT_EXECUTIVE', /no es un ejecutivo activo/],
    ['PORTFOLIO_NO_ACTIVE_CYCLE', /ejecutar la rotación semanal/],
    ['PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED', /ya había sido liberada/],
    ['PORTFOLIO_ASSIGNMENT_NOT_FOUND', /no existe/],
  ])('traduce %s', (code, pattern) => {
    expect(portfolioErrorMessage(err(code))).toMatch(pattern);
  });

  test('recurre al mensaje del servidor o a uno genérico', () => {
    expect(portfolioErrorMessage(err('OTRO'))).toBe('mensaje del servidor');
    expect(portfolioErrorMessage(err('OTRO', 403))).toMatch(/No tienes permiso/);
    expect(portfolioErrorMessage(new Error('x'))).toMatch(/error inesperado/);
    expect(portfolioErrorMessage(err('NETWORK_ERROR', 0))).toMatch(/conectar/);
  });
});
