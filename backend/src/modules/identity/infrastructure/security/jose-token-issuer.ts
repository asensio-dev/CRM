import { createHash } from 'node:crypto';
import { UserRoleSchema } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { CLOCK, type Clock } from '../../../../shared/application';
import { APP_CONFIG, type AppConfig } from '../../../../shared/infrastructure/config/env';
import type { AccessClaims, IssuedRefreshToken, TokenIssuer } from '../../domain';
import { parseTtlSeconds } from './ttl';

const ALG = 'HS256';
const ENCODER = new TextEncoder();

/** JWT HS256 con `jose`. Access y refresh usan secretos distintos y un claim `typ` propio. */
@Injectable()
export class JoseTokenIssuer implements TokenIssuer {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;
  private readonly accessTtl: number;
  readonly refreshTtlSeconds: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.accessKey = ENCODER.encode(config.JWT_ACCESS_SECRET);
    this.refreshKey = ENCODER.encode(config.JWT_REFRESH_SECRET);
    this.accessTtl = parseTtlSeconds(config.JWT_ACCESS_TTL);
    this.refreshTtlSeconds = parseTtlSeconds(config.JWT_REFRESH_TTL);
  }

  issueAccess(claims: AccessClaims): Promise<string> {
    const iat = this.nowSeconds();
    return new SignJWT({ email: claims.email, role: claims.role, typ: 'access' })
      .setProtectedHeader({ alg: ALG })
      .setSubject(String(claims.userId))
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.accessTtl)
      .sign(this.accessKey);
  }

  async issueRefresh(userId: number): Promise<IssuedRefreshToken> {
    const iat = this.nowSeconds();
    const exp = iat + this.refreshTtlSeconds;
    const token = await new SignJWT({ typ: 'refresh' })
      .setProtectedHeader({ alg: ALG })
      .setSubject(String(userId))
      .setJti(crypto.randomUUID())
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.refreshKey);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        algorithms: [ALG],
        currentDate: this.clock.now(),
      });
      const role = UserRoleSchema.safeParse(payload.role);
      const userId = Number(payload.sub);
      if (payload.typ !== 'access' || !role.success || !Number.isInteger(userId)) return null;
      return { userId, email: String(payload.email), role: role.data };
    } catch {
      return null;
    }
  }

  async verifyRefresh(token: string): Promise<{ userId: number } | null> {
    try {
      const { payload } = await jwtVerify(token, this.refreshKey, {
        algorithms: [ALG],
        currentDate: this.clock.now(),
      });
      const userId = Number(payload.sub);
      if (payload.typ !== 'refresh' || !Number.isInteger(userId)) return null;
      return { userId };
    } catch {
      return null;
    }
  }

  hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }
}
