import { SETTING_DEFAULTS } from '@axiom/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CONFIG, type AppConfig } from '../../../../shared/infrastructure/config/env';
import { safeErrorLog } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { RunWeeklyRotationUseCase } from '../../application/use-cases/run-weekly-rotation.use-case';

/** Lunes 06:00 en la zona del negocio. */
export const WEEKLY_ROTATION_CRON = '0 6 * * 1';

/**
 * Job semanal. El cron solo se activa si la app registra `ScheduleModule.forRoot()` (app.module);
 * los tests y scripts que montan PortfolioModule sin él no programan nada.
 * La zona del cron es fija (la del valor por defecto TIMEZONE); el cálculo de semanas sí usa el
 * parámetro TIMEZONE de `settings`.
 */
@Injectable()
export class WeeklyRotationScheduler {
  private readonly logger = new Logger(WeeklyRotationScheduler.name);

  constructor(
    private readonly runWeekly: RunWeeklyRotationUseCase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron(WEEKLY_ROTATION_CRON, {
    name: 'portfolio-weekly-rotation',
    timeZone: SETTING_DEFAULTS.TIMEZONE.value,
  })
  async handle(): Promise<void> {
    // Con varias instancias solo una (SCHEDULER_ENABLED=true) ejecuta el job.
    if (!this.config.SCHEDULER_ENABLED) return;
    try {
      const r = await this.runWeekly.execute();
      this.logger.log(
        `Rotación semanal: ciclo ${r.week.cycle.number} semana ${r.week.weekNumber}/${r.week.totalWeeks}` +
          ` | cerrado=${r.closedCycle?.number ?? '-'} liberadas=${r.closedCycle?.released ?? 0}` +
          ` | asignadas=${r.refill.assigned} faltan=${r.refill.shortfall}` +
          ` | planes=${r.plans.generated} (${r.plans.items} ítems)`,
      );
    } catch (error) {
      this.logger.error('La rotación semanal falló', safeErrorLog(error));
    }
  }
}
