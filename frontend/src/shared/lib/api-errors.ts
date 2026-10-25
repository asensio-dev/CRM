import { HttpError } from '../api/client';

/** Una incidencia de validación de zod tal como la devuelve el API en `details`. */
interface Issue {
  path?: (string | number)[];
  message?: string;
}

/** Mensajes por campo (primer nivel del `path`) de un error 400 INVALID_INPUT. */
export function fieldErrorsFromApi(error: unknown): Record<string, string> {
  if (!(error instanceof HttpError) || error.code !== 'INVALID_INPUT') return {};
  if (!Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const issue of error.details as Issue[]) {
    const field = issue.path?.[0];
    if (typeof field === 'string' && issue.message && !(field in out)) out[field] = issue.message;
  }
  return out;
}

/** Mensaje legible para mostrar en un toast. */
export function errorMessage(error: unknown, fallback = 'Ocurrió un error inesperado.'): string {
  return error instanceof HttpError && error.message ? error.message : fallback;
}
