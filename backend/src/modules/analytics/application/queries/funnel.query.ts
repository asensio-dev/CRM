import {
  type AnalyticsFilter,
  type FunnelDto,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUSES,
  type PipelineStatus,
} from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { type AnalyticsActor, resolveScope } from '../scope';
import { pct, periodRange } from '../time/managua-time';
import { ANALYTICS_READER, type AnalyticsReader } from './read-ports';

/** Camino principal del embudo; SIN_RESPUESTA y DESCARTADO son ramas laterales (sin conversión). */
export const MAIN_PATH: readonly PipelineStatus[] = [
  'POR_CONTACTAR',
  'CONTACTADO',
  'CON_RESPUESTA',
  'AGENDANDO_CITA',
  'EN_PROCESO_CONTRATO',
  'CONTRATO_ACTIVO',
];

@Injectable()
export class GetFunnelQuery {
  constructor(@Inject(ANALYTICS_READER) private readonly reader: AnalyticsReader) {}

  async execute(actor: AnalyticsActor, filter: AnalyticsFilter): Promise<FunnelDto> {
    const scope = resolveScope(actor, filter);
    const [current, reachedRaw] = await Promise.all([
      this.reader.companiesByStatus(scope),
      this.reader.reachedByStatus(scope, periodRange(filter.from, filter.to)),
    ]);
    const total = Object.values(current).reduce((sum, n) => sum + (n ?? 0), 0);
    // Las empresas nacen en POR_CONTACTAR (sin fila de historial): ese estado es el universo.
    const reached: Partial<Record<PipelineStatus, number>> = {
      ...reachedRaw,
      POR_CONTACTAR: total,
    };

    return {
      period: { from: filter.from ?? null, to: filter.to ?? null },
      stages: PIPELINE_STATUSES.map((status) => {
        const idx = MAIN_PATH.indexOf(status);
        const previous = idx > 0 ? MAIN_PATH[idx - 1] : undefined;
        const ratio = previous ? pct(reached[status] ?? 0, reached[previous] ?? 0) : null;
        return {
          status,
          label: PIPELINE_STATUS_LABELS[status],
          current: current[status] ?? 0,
          reached: reached[status] ?? 0,
          // En un periodo acotado puede haber más "llegadas" que en la etapa previa: se topa en 100.
          conversionPct: ratio === null ? null : Math.min(100, ratio),
        };
      }),
    };
  }
}
