import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock, type UseCase } from '../../../../shared/application';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  TOKEN_ISSUER,
  type TokenIssuer,
} from '../../domain';

/** Idempotente: sin token o con token desconocido no hace nada. */
@Injectable()
export class LogoutUseCase implements UseCase<{ refreshToken?: string }, void> {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { refreshToken?: string }): Promise<void> {
    if (!input.refreshToken) return;
    await this.refreshTokens.revokeIfActive(
      this.tokens.hashRefresh(input.refreshToken),
      this.clock.now(),
    );
  }
}
