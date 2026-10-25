import {
  type BoardDto,
  type BoardQuery,
  BoardQuerySchema,
  type ChangeStatusCommand,
  ChangeStatusSchema,
  type Paginated,
  type PaginationQuery,
  PaginationQuerySchema,
  type PipelineStateDto,
  type RegisterInteractionCommand,
  type RegisterInteractionResultDto,
  RegisterInteractionSchema,
  type TimelineEntryDto,
} from '@axiom/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import {
  GetBoardQuery,
  GetPipelineStateQuery,
  GetTimelineQuery,
} from '../../application/queries/pipeline-queries';
import { ChangeCompanyStatusUseCase } from '../../application/use-cases/change-company-status.use-case';
import { RegisterInteractionUseCase } from '../../application/use-cases/register-interaction.use-case';
import type { Actor } from '../../domain';

/** Mientras no esté el guard global de identity, `user` puede faltar: 401 en vez de fallar. */
function actorOf(user: AuthenticatedUser | undefined): Actor {
  if (!user) throw new UnauthorizedException('Autenticación requerida');
  return { userId: user.id, role: user.role };
}

@ApiTags('Pipeline')
@ApiBearerAuth()
@Controller('pipeline')
export class PipelineController {
  constructor(
    private readonly getState: GetPipelineStateQuery,
    private readonly getTimeline: GetTimelineQuery,
    private readonly getBoard: GetBoardQuery,
    private readonly changeStatus: ChangeCompanyStatusUseCase,
    private readonly registerInteraction: RegisterInteractionUseCase,
  ) {}

  @Get('board')
  board(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(BoardQuerySchema)) query: BoardQuery,
  ): Promise<BoardDto> {
    actorOf(user);
    return this.getBoard.execute(query);
  }

  @Get('companies/:id')
  state(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PipelineStateDto> {
    return this.getState.execute(id, actorOf(user).role);
  }

  @Get('companies/:id/timeline')
  timeline(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<TimelineEntryDto>> {
    actorOf(user);
    return this.getTimeline.execute(id, query.page, query.pageSize);
  }

  @Post('companies/:id/status')
  @HttpCode(HttpStatus.OK)
  status(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ChangeStatusSchema)) body: ChangeStatusCommand,
  ): Promise<PipelineStateDto> {
    const actor = actorOf(user);
    return this.changeStatus.execute({
      companyId: id,
      to: body.to,
      note: body.note,
      expectedVersion: body.expectedVersion,
      actor,
    });
  }

  @Post('companies/:id/interactions')
  @HttpCode(HttpStatus.CREATED)
  interaction(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(RegisterInteractionSchema)) body: RegisterInteractionCommand,
  ): Promise<RegisterInteractionResultDto> {
    const actor = actorOf(user);
    return this.registerInteraction.execute({ companyId: id, actor, ...body });
  }
}
