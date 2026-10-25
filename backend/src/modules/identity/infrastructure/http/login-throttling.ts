import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Límites del login / refresh (solo se aplican donde se usa `ThrottlerGuard`):
 * - `default`: por IP (5/min). Detrás de un proxy inverso requiere TRUST_PROXY para ver la IP real.
 * - `account`: por CUENTA (10 intentos / 15 min por correo), para que rotar IPs no permita probar
 *   contraseñas sin fin contra un mismo usuario. Coste aceptado: un atacante puede bloquear el login
 *   de una cuenta concreta durante 15 min.
 */
export const LOGIN_THROTTLERS: ThrottlerOptions[] = [
  { name: 'default', ttl: 60_000, limit: 5 },
  { name: 'account', ttl: 15 * 60_000, limit: 10, getTracker: loginAccountTracker },
];

interface TrackedRequest {
  ip?: string;
  body?: unknown;
}

/** Clave del límite por cuenta: el correo normalizado del cuerpo (o la IP si no viene). */
export function loginAccountTracker(req: Record<string, unknown>): string {
  const { ip, body } = req as TrackedRequest;
  const email = (body as { email?: unknown } | undefined)?.email;
  if (typeof email === 'string' && email.trim() !== '') {
    return `email:${email.trim().toLowerCase().slice(0, 150)}`;
  }
  return `ip:${ip ?? 'desconocida'}`;
}
