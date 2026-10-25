import type { DomainError } from './domain-error';

/** Resultado explícito para operaciones de dominio que pueden fallar por reglas de negocio. */
export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E>(error: E): Result<never, E> => ({ ok: false, error });
