import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { RefreshTokenRepository, StoredRefreshToken } from '../../domain';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { userId: number; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.prisma.db.refreshToken.create({ data: input });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const row = await this.prisma.db.refreshToken.findUnique({ where: { tokenHash } });
    return row
      ? {
          id: row.id,
          userId: row.userId,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          replacedAt: row.replacedAt,
        }
      : null;
  }

  async revokeIfActive(
    tokenHash: string,
    now: Date,
    options: { replaced?: boolean } = {},
  ): Promise<boolean> {
    const { count } = await this.prisma.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now, replacedAt: options.replaced ? now : null },
    });
    return count === 1;
  }

  async revokeActiveIssuedSince(userId: number, since: Date, now: Date): Promise<number> {
    const { count } = await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now }, createdAt: { gte: since } },
      data: { revokedAt: now },
    });
    return count;
  }

  async revokeAllForUser(userId: number, now: Date): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
