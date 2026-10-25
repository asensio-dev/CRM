import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CLOCK, type Clock, type UseCase } from '../../../../shared/application';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  TOKEN_ISSUER,
  type TokenIssuer,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain';
import { type Session, SessionIssuer } from '../session-issuer';

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

    // Reutilización de un token ya rotado/revocado → posible robo: se invalida toda la familia.
    if (stored.revokedAt) {
      await this.refreshTokens.revokeAllForUser(stored.userId, now);
      throw this.unauthorized();
    }
    if (stored.expiresAt <= now) throw this.unauthorized();

    // Rotación atómica: si otro request lo revocó entre medias, también es reutilización.
    if (!(await this.refreshTokens.revokeIfActive(hash, now))) {
      await this.refreshTokens.revokeAllForUser(stored.userId, now);
      throw this.unauthorized();
    }

    const user = await this.users.findById(stored.userId);
    if (!user?.isActive) {
      await this.refreshTokens.revokeAllForUser(stored.userId, now);
      throw this.unauthorized();
    }
    return this.sessions.issue(user);
  }

  private unauthorized() {
    return new UnauthorizedException('Sesión inválida o expirada');
  }
}
