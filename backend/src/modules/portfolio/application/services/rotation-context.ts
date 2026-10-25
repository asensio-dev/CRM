import type { CycleDto, UserRole, WeekInfoDto } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/application';
import {
  addDays,
  BusinessCalendar,
  CYCLE_REPOSITORY,
  type CycleRepository,
  type LocalDate,
  noActiveCycle,
  PORTFOLIO_SETTINGS,
  type PortfolioSettings,
  type PortfolioSettingsProvider,
  portfolioForbidden,
  type RotationCycle,
} from '../../domain';

export interface RotationSnapshot {
  now: Date;
  settings: PortfolioSettings;
  calendar: BusinessCalendar;
  today: LocalDate;
  /** Lunes de la semana actual (local). */
  monday: LocalDate;
  /** Último ciclo si sigue abierto; null si no hay ninguno abierto. */
  cycle: RotationCycle | null;
}

/** Lee parámetros, reloj y ciclo actual: el punto de partida de casi todos los casos de uso. */
@Injectable()
export class RotationContext {
  constructor(
    @Inject(PORTFOLIO_SETTINGS) private readonly settings: PortfolioSettingsProvider,
    @Inject(CYCLE_REPOSITORY) private readonly cycles: CycleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async snapshot(): Promise<RotationSnapshot> {
    const now = this.clock.now();
    const settings = await this.settings.get();
    const calendar = new BusinessCalendar(settings.timezone);
    const latest = await this.cycles.findLatest();
    const today = calendar.today(now);
    return {
      now,
      settings,
      calendar,
      today,
      monday: calendar.currentMonday(now),
      cycle: latest && !latest.isClosed ? latest : null,
    };
  }

  async requireOpenCycle(): Promise<RotationSnapshot & { cycle: RotationCycle }> {
    const snap = await this.snapshot();
    if (!snap.cycle) throw noActiveCycle();
    return snap as RotationSnapshot & { cycle: RotationCycle };
  }
}

export const isSupervisorRole = (role: UserRole) => role === 'ADMIN' || role === 'SUPERVISOR';

export function assertSupervisor(role: UserRole): void {
  if (!isSupervisorRole(role)) throw portfolioForbidden();
}

export function toCycleDto(cycle: RotationCycle): CycleDto {
  return {
    id: cycle.id as number,
    number: cycle.number,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    totalWeeks: cycle.totalWeeks,
    closedAt: cycle.closedAt ? cycle.closedAt.toISOString() : null,
  };
}

export function toWeekInfo(cycle: RotationCycle, monday: LocalDate): WeekInfoDto {
  const weekNumber = cycle.weekNumberOf(monday);
  const weekStart = cycle.weekStart(weekNumber);
  return {
    cycle: toCycleDto(cycle),
    weekNumber,
    totalWeeks: cycle.totalWeeks,
    weekStart,
    weekEnd: addDays(weekStart, 6),
  };
}
