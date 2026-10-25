import type {
  BoardDto,
  BoardQuery,
  Paginated,
  PipelineStateDto,
  TimelineEntryDto,
  UserRole,
} from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  COMPANY_PIPELINE_REPOSITORY,
  type CompanyPipelineRepository,
  companyNotFound,
} from '../../domain';
import { toPipelineStateDto } from '../dtos/pipeline-state.mapper';
import {
  PIPELINE_BOARD_READER,
  PIPELINE_TIMELINE_READER,
  type PipelineBoardReader,
  type PipelineTimelineReader,
} from './read-ports';

/** Estado actual + transiciones que el usuario puede hacer (las calcula la máquina de estados). */
@Injectable()
export class GetPipelineStateQuery {
  constructor(
    @Inject(COMPANY_PIPELINE_REPOSITORY) private readonly pipelines: CompanyPipelineRepository,
  ) {}

  async execute(companyId: number, role: UserRole): Promise<PipelineStateDto> {
    const pipeline = await this.pipelines.findById(companyId);
    if (!pipeline) throw companyNotFound(companyId);
    return toPipelineStateDto(pipeline, role);
  }
}

@Injectable()
export class GetTimelineQuery {
  constructor(
    @Inject(COMPANY_PIPELINE_REPOSITORY) private readonly pipelines: CompanyPipelineRepository,
    @Inject(PIPELINE_TIMELINE_READER) private readonly reader: PipelineTimelineReader,
  ) {}

  async execute(
    companyId: number,
    page: number,
    pageSize: number,
  ): Promise<Paginated<TimelineEntryDto>> {
    if (!(await this.pipelines.findById(companyId))) throw companyNotFound(companyId);
    return this.reader.read(companyId, page, pageSize);
  }
}

@Injectable()
export class GetBoardQuery {
  constructor(@Inject(PIPELINE_BOARD_READER) private readonly reader: PipelineBoardReader) {}

  execute(query: BoardQuery): Promise<BoardDto> {
    return this.reader.read(query);
  }
}
