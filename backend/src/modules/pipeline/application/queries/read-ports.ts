import type { BoardDto, BoardQuery, Paginated, TimelineEntryDto } from '@axiom/contracts';

/** Lecturas optimizadas (CQRS ligero): devuelven DTOs directamente, sin pasar por el dominio. */
export interface PipelineTimelineReader {
  /** Interacciones y cambios de estado mezclados, más reciente primero. */
  read(companyId: number, page: number, pageSize: number): Promise<Paginated<TimelineEntryDto>>;
}

export interface PipelineBoardReader {
  /** Conteo por estado + primeras N tarjetas de cada columna. */
  read(query: BoardQuery): Promise<BoardDto>;
}

export const PIPELINE_TIMELINE_READER = Symbol('PipelineTimelineReader');
export const PIPELINE_BOARD_READER = Symbol('PipelineBoardReader');
