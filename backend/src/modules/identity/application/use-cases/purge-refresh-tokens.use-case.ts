import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock, type UseCase } from '../../../../shared/application';
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from '../../domain';

/** Días que se conservan los refresh tokens caducados o revocados (auditoría de reutilización). */
export const REFRESH_TOKEN_RETENTION_DAYS = 30;
export const PURGE_BATCH_SIZE = 500;
/** Tope de lotes por ejecución: acota el trabajo de un solo disparo del cron. */
export const PURGE_MAX_BATCHES = 200;

/** Borra por lotes los refresh tokens caducados o revocados hace más de 30 días. */
@Injectable()
export class PurgeRefreshTokensUseCase
  implements UseCase<{ batchSize?: number } | undefined, { deleted: number }>
{
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input?: { batchSize?: number }): Promise<{ deleted: number }> {
    const batchSize = input?.batchSize ?? PURGE_BATCH_SIZE;
    const cutoff = new Date(
      this.clock.now().getTime() - REFRESH_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    let deleted = 0;
    for (let i = 0; i < PURGE_MAX_BATCHES; i++) {
      const n = await this.refreshTokens.deleteStale(cutoff, batchSize);
      deleted += n;
      if (n < batchSize) break;
    }
    return { deleted };
  }
}
