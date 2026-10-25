import type { UserRole } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/application';
import { type AccessClaims, USER_REPOSITORY, type UserRepository } from '../domain';

/** Cuánto se reutiliza el estado leído de la BD antes de volver a consultarlo. */
export const SESSION_CHECK_TTL_MS = 30_000;
/** Las marcas de revocación se olvidan pasado este tiempo (mayor que cualquier access TTL razonable). */
const REVOCATION_MEMORY_MS = 24 * 60 * 60 * 1000;

interface CachedUserState {
  active: boolean;
  role: UserRole | null;
  expiresAt: number;
}

/**
 * Comprueba en cada petición que el access token sigue representando a un usuario ACTIVO con el
 * MISMO rol que dice el token. Sin esto, desactivar a alguien o quitarle un rol no surtía efecto
 * hasta que caducaba su access token (hasta 15 min).
 *
 * - Estado del usuario: caché en memoria de {@link SESSION_CHECK_TTL_MS} (1 consulta por usuario
 *   cada 30 s como mucho). Funciona con varias instancias: cada una relee la BD.
 * - `revokeSessions`: además invalida al instante los access tokens emitidos ANTES (por `iat`) en
 *   esta instancia (reset de contraseña, desactivación, cambio de rol). Con varias instancias, en las
 *   demás el corte llega con la caché (≤ 30 s) para rol/estado; el reset de contraseña solo corta allí
 *   los refresh tokens (documentado en docs/security-review.md).
 */
@Injectable()
export class ActiveSessionChecker {
  private readonly cache = new Map<number, CachedUserState>();
  private readonly revokedBefore = new Map<number, { iat: number; at: number }>();

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async isValid(claims: AccessClaims): Promise<boolean> {
    const now = this.clock.now().getTime();
    const revoked = this.revokedBefore.get(claims.userId);
    if (revoked && (claims.issuedAt ?? 0) < revoked.iat) return false;

    let state = this.cache.get(claims.userId);
    if (!state || state.expiresAt <= now) {
      const user = await this.users.findById(claims.userId);
      state = {
        active: user?.isActive ?? false,
        role: user?.role ?? null,
        expiresAt: now + SESSION_CHECK_TTL_MS,
      };
      this.cache.set(claims.userId, state);
    }
    return state.active && state.role === claims.role;
  }

  /** Corta las sesiones vigentes del usuario: tokens con `iat` anterior a ahora dejan de valer. */
  revokeSessions(userId: number): void {
    const now = this.clock.now().getTime();
    this.cache.delete(userId);
    // `iat` tiene resolución de segundos: se invalida todo lo emitido antes del segundo actual.
    this.revokedBefore.set(userId, { iat: Math.floor(now / 1000), at: now });
    for (const [id, mark] of this.revokedBefore) {
      if (now - mark.at > REVOCATION_MEMORY_MS) this.revokedBefore.delete(id);
    }
  }
}
