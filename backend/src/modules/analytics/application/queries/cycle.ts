import type { CycleInfoDto } from '@axiom/contracts';
import { addDays, diffDays, managuaDay, startOfDayUtc, type UtcRange } from '../time/managua-time';
import type { CycleRow } from './read-ports';

/** Rango UTC [inicio, fin) del ciclo; `endDay` es inclusivo. */
export function cycleRange(cycle: CycleRow): UtcRange {
  return { from: startOfDayUtc(cycle.startDay), to: startOfDayUtc(addDays(cycle.endDay, 1)) };
}

/** Semana k de N según las fechas del ciclo (1 ≤ k ≤ N). */
export function toCycleInfo(cycle: CycleRow, now: Date): CycleInfoDto {
  const totalWeeks = Math.max(1, Math.ceil((diffDays(cycle.startDay, cycle.endDay) + 1) / 7));
  const elapsed = diffDays(cycle.startDay, managuaDay(now));
  const weekNumber = Math.min(totalWeeks, Math.max(1, Math.floor(elapsed / 7) + 1));
  return {
    id: cycle.id,
    number: cycle.number,
    startDate: cycle.startDay,
    endDate: cycle.endDay,
    weekNumber,
    totalWeeks,
  };
}
