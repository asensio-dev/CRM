import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CLOCK, type Clock, type UseCase } from '../../../../shared/application';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  type StoredRefreshToken,
  TOKEN_ISSUER,
  type TokenIssuer,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain';
import { type Session, SessionIssuer } from '../session-issuer';

/**
 * Margen de gracia tras una rotación (ADR 0007). Si el navegador recarga o hay pestañas concurrentes
 * mientras `/auth/refresh` está en vuelo, el servidor rota el token pero el navegador nunca guarda la
 * cookie nueva y reenvía la anterior. Dentro de este margen, y solo si el sucesor sigue activo, se
 * considera benigno: se revoca el sucesor perdido y se emite otra sesión en vez de tratarlo como robo.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;
/** Tolerancia entre el reloj de la app (replacedAt) y el `DEFAULT now()` de la BD (createdAt). */
const CLOCK_SKEW_MS = 5_000;

@Injectable()
export class RefreshSessionUseCase implements UseCase<{ refreshToken: string }, Session> {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: { refreshToken: string }): Promise<Session> {
    const claims = await this.tokens.verifyRefresh(input.refreshToken);
    if (!claims) throw this.unauthorized();

    const now = this.clock.now();
    const hash = this.tokens.hashRefresh(input.refreshToken);
    const stored = await this.refreshTokens.findByHash(hash);
    if (!stored || stored.userId !== claims.userId) throw this.unauthorized();

    if (stored.expiresAt <= now) throw this.unauthorized();

    if (stored.revokedAt) {
      // Recarga/pestañas concurrentes justo tras rotar: se reemplaza el sucesor que el navegador perdió.
      if (!(await this.isBenignReuse(stored, now))) {
        // Reutilización de un token ya rotado/revocado → posible robo: se invalida toda la familia.
        await this.refreshTokens.revokeAllForUser(stored.userId, now);
        throw this.unauthorized();
      }
    } else if (!(await this.refreshTokens.revokeIfActive(hash, now, { replaced: true }))) {
      // Rotación atómica: si otro request lo revocó entre medias, se reevalúa como reutilización.
      const current = await this.refreshTokens.findByHash(hash);
      if (!current || !(await this.isBenignReuse(current, now))) {
        await this.refreshTokens.revokeAllForUser(stored.userId, now);
        throw this.unauthorized();
      }
    }

    const user = await this.users.findById(stored.userId);
    if (!user?.isActive) {
      await this.refreshTokens.revokeAllForUser(stored.userId, now);
      throw this.unauthorized();
    }
    return this.sessions.issue(user);
  }

  private async isBenignReuse(token: StoredRefreshToken, now: Date): Promise<boolean> {
    if (!token.replacedAt) return false; // revocado por logout, cambio de usuario o robo
    if (now.getTime() - token.replacedAt.getTime() > REFRESH_REUSE_GRACE_MS) return false;
    const since = new Date(token.replacedAt.getTime() - CLOCK_SKEW_MS);
    // Solo si el sucesor sigue vivo (si hubo logout o revocación de familia, ya no lo está).
    return (await this.refreshTokens.revokeActiveIssuedSince(token.userId, since, now)) > 0;
  }

  private unauthorized() {
    return new UnauthorizedException('Sesión inválida o expirada');
  }
}
