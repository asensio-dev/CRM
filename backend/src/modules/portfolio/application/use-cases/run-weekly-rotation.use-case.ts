import type { RunWeeklyResultDto } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/application';
import { CYCLE_REPOSITORY, type CycleRepository, RotationCycle } from '../../domain';
import { RotationContext, toWeekInfo } from '../services/rotation-context';
import { CloseCycleUseCase } from './close-cycle.use-case';
import { GenerateWeeklyPlansUseCase } from './generate-weekly-plans.use-case';
import { RefillPortfoliosUseCase } from './refill-portfolios.use-case';

/**
 * Job semanal (lunes 06:00 America/Managua, o POST /api/portfolio/run-weekly):
 *  1. Si el ciclo abierto ya terminó → cerrarlo (evaluar avance, liberar SIN_AVANCE).
 *  2. Si no hay ciclo abierto → abrir el siguiente.
 *  3. Rellenar carteras hasta PORTFOLIO_SIZE.
 *  4. Generar los planes de la semana que falten.
 * Ejecutarlo dos veces seguidas no cambia nada la segunda vez; dos llamadas simultáneas en el
 * mismo proceso comparten la misma ejecución.
 */
@Injectable()
export class RunWeeklyRotationUseCase {
  private inFlight: Promise<RunWeeklyResultDto> | null = null;

  constructor(
    private readonly context: RotationContext,
    @Inject(CYCLE_REPOSITORY) private readonly cycles: CycleRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly closeCycle: CloseCycleUseCase,
    private readonly refill: RefillPortfoliosUseCase,
    private readonly generatePlans: GenerateWeeklyPlansUseCase,
  ) {}

  execute(): Promise<RunWeeklyResultDto> {
    if (!this.inFlight) {
      this.inFlight = this.run().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async run(): Promise<RunWeeklyResultDto> {
    const snap = await this.context.snapshot();
    const { now, settings, calendar, today, monday } = snap;

    let closedCycle: RunWeeklyResultDto['closedCycle'] = null;
    let cycle = snap.cycle;
    if (cycle?.hasEndedBy(today)) {
      const summary = await this.closeCycle.execute({ cycle, settings, calendar, now });
      closedCycle = {
        number: summary.number,
        evaluated: summary.evaluated,
        withProgress: summary.withProgress,
        withoutProgress: summary.withoutProgress,
        released: summary.released,
      };
      cycle = null;
    }

    let openedCycle: number | null = null;
    if (!cycle) {
      const opened = await this.uow.run(async () => {
        const next = RotationCycle.openNext(
          await this.cycles.findLatest(),
          today,
          settings.cycleWeeks,
        );
        await this.cycles.save(next);
        return next;
      });
      openedCycle = opened.number;
      cycle = opened;
    }

    const refill = await this.refill.execute({ cycle, settings, now });
    const plans = await this.generatePlans.execute({ cycle, monday, settings, calendar });

    return {
      closedCycle,
      openedCycle,
      week: toWeekInfo(cycle, monday),
      refill: {
        executives: refill.executives,
        assigned: refill.assigned,
        shortfall: refill.shortfall,
      },
      plans: { generated: plans.generated, existing: plans.existing, items: plans.items },
    };
  }
}
