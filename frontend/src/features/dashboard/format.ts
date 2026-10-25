import type { FunnelStageDto, Pct } from '@axiom/contracts';
import { PIPELINE_STATUSES } from '@axiom/contracts';

const pctFormat = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 1 });
const intFormat = new Intl.NumberFormat('es-NI');

/** "112.5 %" (sin tope: >100 se muestra tal cual) o "—" si no hay denominador. */
export function formatPct(value: Pct | undefined): string {
  return value === null || value === undefined ? '—' : `${pctFormat.format(value)} %`;
}

export const formatInt = (n: number) => intFormat.format(n);

/** Ancho de una barra de progreso (0–100): el valor real puede pasar de 100, la barra no. */
export function barWidth(value: Pct | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Variación respecto a la semana previa: texto y tono para el delta de un KPI. */
export function formatDelta(
  current: number,
  previous: number,
): { text: string; tone: 'up' | 'down' | 'flat' } {
  const diff = current - previous;
  if (diff === 0) return { text: 'Igual que la semana pasada', tone: 'flat' };
  const sign = diff > 0 ? '+' : '−';
  return {
    text: `${sign}${intFormat.format(Math.abs(diff))} vs semana pasada`,
    tone: diff > 0 ? 'up' : 'down',
  };
}

/** Etapas del embudo en el orden del pipeline (el backend puede devolverlas en otro orden). */
export function orderStages(stages: readonly FunnelStageDto[]): FunnelStageDto[] {
  return [...stages].sort(
    (a, b) => PIPELINE_STATUSES.indexOf(a.status) - PIPELINE_STATUSES.indexOf(b.status),
  );
}
