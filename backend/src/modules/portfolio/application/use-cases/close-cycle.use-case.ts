import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/application';
import {
  ASSIGNMENT_REPOSITORY,
  type AssignmentRepository,
  type BusinessCalendar,
  CYCLE_EVIDENCE_READER,
  CYCLE_REPOSITORY,
  type CycleEvidenceReader,
  type CycleRepository,
  madeProgress,
  type PortfolioSettings,
  type RotationCycle,
} from '../../domain';

export interface CloseCycleInput {
  cycle: RotationCycle;
  settings: PortfolioSettings;
  calendar: BusinessCalendar;
  now: Date;
}

export interface CloseCycleSummary {
  number: number;
  evaluated: number;
  withProgress: number;
  withoutProgress: number;
  released: number;
}

/**
 * Cierra un ciclo: evalúa el avance de cada asignación activa dentro de la ventana del ciclo
 * (ver `madeProgress`), actualiza `cyclesWithoutProgress` y libera al pool (SIN_AVANCE) las que
 * llegan a MAX_CYCLES_WITHOUT_PROGRESS. Las asignadas durante la última semana del ciclo no se
 * evalúan (no tuvieron tiempo). Idempotente: un ciclo cerrado no se vuelve a evaluar.
 */
@Injectable()
export class CloseCycleUseCase {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(CYCLE_REPOSITORY) private readonly cycles: CycleRepository,
    @Inject(CYCLE_EVIDENCE_READER) private readonly evidence: CycleEvidenceReader,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute({ cycle, settings, calendar, now }: CloseCycleInput): Promise<CloseCycleSummary> {
    const summary: CloseCycleSummary = {
      number: cycle.number,
      evaluated: 0,
      withProgress: 0,
      withoutProgress: 0,
      released: 0,
    };
    if (cycle.isClosed) return summary;

    await this.uow.run(async () => {
      const window = calendar.range(cycle.startDate, cycle.endDate);
      const lastWeek = calendar.week(cycle.lastWeekStart).start;
      const evaluable = (await this.assignments.findActive()).filter(
        (a) => a.assignedAt < lastWeek,
      );
      const facts = await this.evidence.forCompanies(
        evaluable.map((a) => a.companyId),
        window,
      );
      for (const assignment of evaluable) {
        const outcome = assignment.recordCycleOutcome(
          madeProgress(facts.get(assignment.companyId)),
          settings.maxCyclesWithoutProgress,
          now,
        );
        summary.evaluated++;
        if (outcome === 'PROGRESS') summary.withProgress++;
        else summary.withoutProgress++;
        if (outcome === 'RELEASED') summary.released++;
      }
      await this.assignments.saveAll(evaluable);
      cycle.close(now);
      await this.cycles.save(cycle);
    });
    return summary;
  }
}
