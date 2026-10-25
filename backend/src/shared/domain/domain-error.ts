/**
 * Error de negocio. El dominio lanza (o devuelve en un Result) estos errores;
 * el filtro HTTP global los traduce a 4xx según `kind`.
 */
export type DomainErrorKind = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'RULE';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: DomainErrorKind = 'RULE',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static validation(code: string, message: string, details?: unknown) {
    return new DomainError(code, message, 'VALIDATION', details);
  }

  static notFound(code: string, message: string) {
    return new DomainError(code, message, 'NOT_FOUND');
  }

  static conflict(code: string, message: string) {
    return new DomainError(code, message, 'CONFLICT');
  }
}
