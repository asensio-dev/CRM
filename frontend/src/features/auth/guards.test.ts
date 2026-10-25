import { describe, expect, test } from 'bun:test';
import { safeRedirect } from './guards';

describe('safeRedirect (open redirect)', () => {
  test('acepta rutas internas con query y hash', () => {
    expect(safeRedirect('/empresas/12?tab=historial#x')).toBe('/empresas/12?tab=historial#x');
    expect(safeRedirect('/mi-semana')).toBe('/mi-semana');
  });

  test('rechaza destinos externos o que el navegador normaliza a externos', () => {
    for (const target of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      ' /x',
      'javascript:alert(1)',
      undefined,
      42,
      `/${'a'.repeat(3000)}`,
    ]) {
      expect(safeRedirect(target)).toBeUndefined();
    }
  });
});
