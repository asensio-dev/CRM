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
      ? { id: row.id, userId: row.userId, expiresAt: row.expiresAt, revokedAt: row.revokedAt }
      : null;
  }

  async revokeIfActive(tokenHash: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  async revokeAllForUser(userId: number, now: Date): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
