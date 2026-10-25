import type { AuthUser } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  TOKEN_ISSUER,
  type TokenIssuer,
  type User,
} from '../domain';
import { toAuthUser } from './mappers';

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

/** Emite access + refresh token y persiste el hash del refresh. */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async issue(user: User): Promise<Session> {
    const userId = user.id as number;
    const accessToken = await this.tokens.issueAccess({
      userId,
      email: user.email.value,
      role: user.role,
    });
    const refresh = await this.tokens.issueRefresh(userId);
    await this.refreshTokens.create({
      userId,
      tokenHash: this.tokens.hashRefresh(refresh.token),
      expiresAt: refresh.expiresAt,
    });
    return {
      accessToken,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user: toAuthUser(user),
    };
  }
}
