import { LIMIT_STEP, MAX_LIMIT } from './search';

/**
 * Paginación por columna del tablero.
 *
 * El endpoint `/pipeline/board` no admite desplazamiento por estado: devuelve, para cada
 * columna, el total real (`count`) y las primeras `limitPerColumn` tarjetas (máx. 100). Por eso
 * las páginas se cortan en cliente sobre las tarjetas ya cargadas y, cuando una página pide
 * tarjetas que aún no llegaron, se sube `limitPerColumn` (un único valor para todo el tablero).
 */
export const COLUMN_PAGE_SIZE = 8;

/** Tarjetas que se pueden llegar a mostrar en una columna (el API no pasa de `MAX_LIMIT`). */
export const reachableCards = (count: number) => Math.min(count, MAX_LIMIT);

/** Número de páginas de una columna (al menos 1). */
export const columnPageCount = (count: number) =>
  Math.max(1, Math.ceil(reachableCards(count) / COLUMN_PAGE_SIZE));

/** Recorta la página pedida al rango válido de la columna. */
export const clampPage = (page: number, count: number) =>
  Math.min(Math.max(1, page), columnPageCount(count));

/**
 * `limitPerColumn` necesario para pintar completa la página `page` de una columna, o `null` si
 * con el límite actual basta (o ya no se puede pedir más).
 */
export function limitForPage(page: number, count: number, currentLimit: number): number | null {
  const needed = Math.min(page * COLUMN_PAGE_SIZE, reachableCards(count));
  if (needed <= currentLimit) return null;
  const next = Math.min(MAX_LIMIT, Math.ceil(needed / LIMIT_STEP) * LIMIT_STEP);
  return next > currentLimit ? next : null;
}
