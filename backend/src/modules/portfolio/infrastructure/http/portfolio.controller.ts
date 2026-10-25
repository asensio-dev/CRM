import {
  type AssignmentChangeResultDto,
  type AssignmentDto,
  type AssignmentsQuery,
  AssignmentsQuerySchema,
  type BulkAssignCommand,
  BulkAssignSchema,
  type CurrentCycleDto,
  type MyWeekDto,
  type MyWeekQuery,
  MyWeekQuerySchema,
  type Paginated,
  type ReassignCommand,
  ReassignSchema,
  type ReleaseAssignmentCommand,
  ReleaseAssignmentSchema,
  type RunWeeklyResultDto,
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
import {
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import {
  GetCurrentCycleQuery,
  GetMyWeekQuery,
  ListAssignmentsQuery,
} from '../../application/queries/portfolio-queries';
import {
  BulkAssignCompaniesUseCase,
  ReassignCompaniesUseCase,
  ReleaseAssignmentUseCase,
} from '../../application/use-cases/assignment-commands.use-case';
import { RunWeeklyRotationUseCase } from '../../application/use-cases/run-weekly-rotation.use-case';
import { portfolioForbidden } from '../../domain';

function actorOf(user: AuthenticatedUser | undefined) {
  if (!user) throw new UnauthorizedException('Autenticación requerida');
  return { userId: user.id, role: user.role };
}

/** Los roles se comprueban con @Roles (guard global) y otra vez en los casos de uso. */
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly myWeekQuery: GetMyWeekQuery,
    private readonly currentCycleQuery: GetCurrentCycleQuery,
    private readonly listAssignments: ListAssignmentsQuery,
    private readonly reassignUseCase: ReassignCompaniesUseCase,
    private readonly bulkUseCase: BulkAssignCompaniesUseCase,
    private readonly releaseUseCase: ReleaseAssignmentUseCase,
    private readonly runWeekly: RunWeeklyRotationUseCase,
  ) {}

  @Get('my-week')
  myWeek(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(MyWeekQuerySchema)) query: MyWeekQuery,
  ): Promise<MyWeekDto> {
    return this.myWeekQuery.execute({ viewer: actorOf(user), userId: query.userId });
  }

  @Get('cycles/current')
  currentCycle(@CurrentUser() user: AuthenticatedUser | undefined): Promise<CurrentCycleDto> {
    return this.currentCycleQuery.execute({ viewer: actorOf(user) });
  }

  @Get('assignments')
  assignments(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(AssignmentsQuerySchema)) query: AssignmentsQuery,
  ): Promise<Paginated<AssignmentDto>> {
    return this.listAssignments.execute({ viewer: actorOf(user), query });
  }

  @Post('assignments/reassign')
  @Roles('ADMIN', 'SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  reassign(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(ReassignSchema)) body: ReassignCommand,
  ): Promise<AssignmentChangeResultDto> {
    return this.reassignUseCase.execute({ ...body, actor: actorOf(user) });
  }

  @Post('assignments/bulk')
  @Roles('ADMIN', 'SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  bulk(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(BulkAssignSchema)) body: BulkAssignCommand,
  ): Promise<AssignmentChangeResultDto> {
    return this.bulkUseCase.execute({ ...body, actor: actorOf(user) });
  }

  @Post('assignments/:id/release')
  @Roles('ADMIN', 'SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  release(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ReleaseAssignmentSchema)) body: ReleaseAssignmentCommand,
  ): Promise<AssignmentChangeResultDto> {
    return this.releaseUseCase.execute({
      assignmentId: id,
      reason: body.reason,
      actor: actorOf(user),
    });
  }

  @Post('run-weekly')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  run(@CurrentUser() user: AuthenticatedUser | undefined): Promise<RunWeeklyResultDto> {
    const actor = actorOf(user);
    if (actor.role !== 'ADMIN') throw portfolioForbidden('Solo ADMIN puede ejecutar la rotación');
    return this.runWeekly.execute();
  }
}
