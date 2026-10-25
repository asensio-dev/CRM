import { z } from 'zod';

/**
 * Normalización compartida por el alta manual (companies), la importación (import) y el frontend.
 * El Excel trae RUC como texto o como número; siempre se guarda como texto en mayúsculas sin espacios.
 */
export function normalizeRuc(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim().replace(/[\s-]/g, '').toUpperCase();
  return value.length > 0 && value.length <= 20 ? value : null;
}

/** Teléfono solo con dígitos (y `+` inicial). Devuelve null si queda vacío o es implausible. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw)
    .trim()
    .replace(/(?!^\+)[^\d]/g, '');
  return value.replace('+', '').length >= 7 && value.length <= 20 ? value : null;
}

export const RucSchema = z.string().transform((v, ctx) => {
  const ruc = normalizeRuc(v);
  if (!ruc) ctx.addIssue({ code: 'custom', message: 'RUC inválido' });
  return ruc ?? '';
});
