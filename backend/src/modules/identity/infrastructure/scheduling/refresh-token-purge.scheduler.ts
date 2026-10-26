import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CONFIG, type AppConfig } from '../../../../shared/infrastructure/config/env';
import { safeErrorLog } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { PurgeRefreshTokensUseCase } from '../../application/use-cases/purge-refresh-tokens.use-case';

/** Todos los días 03:30. */
export const REFRESH_TOKEN_PURGE_CRON = '30 3 * * *';

/** Limpieza diaria de `refresh_tokens`. Respeta SCHEDULER_ENABLED (una sola instancia la ejecuta). */
@Injectable()
export class RefreshTokenPurgeScheduler {
  private readonly logger = new Logger(RefreshTokenPurgeScheduler.name);

  constructor(
    private readonly purge: PurgeRefreshTokensUseCase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron(REFRESH_TOKEN_PURGE_CRON, { name: 'identity-refresh-token-purge' })
  async handle(): Promise<void> {
    if (!this.config.SCHEDULER_ENABLED) return;
    try {
      const { deleted } = await this.purge.execute();
      this.logger.log(`Limpieza de refresh tokens: ${deleted} filas borradas`);
    } catch (error) {
      this.logger.error('La limpieza de refresh tokens falló', safeErrorLog(error));
    }
  }
}
