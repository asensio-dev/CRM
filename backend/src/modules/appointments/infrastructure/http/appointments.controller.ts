import {
  type AgendaQuery,
  AgendaQuerySchema,
  type AppointmentDto,
  type CancelAppointmentRequest,
  CancelAppointmentSchema,
  type CompleteAppointmentRequest,
  CompleteAppointmentSchema,
  type ListAppointmentsQuery,
  ListAppointmentsQuerySchema,
  type Paginated,
  type RescheduleAppointmentCommand,
  RescheduleAppointmentSchema,
  type RescheduleResultDto,
  type ScheduleAppointmentCommand,
  ScheduleAppointmentSchema,
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
import type { AppointmentActor } from '../../application/actor';
import { CancelAppointmentUseCase } from '../../application/use-cases/cancel-appointment.use-case';
import { CompleteAppointmentUseCase } from '../../application/use-cases/complete-appointment.use-case';
import {
  GetAgendaUseCase,
  ListAppointmentsUseCase,
} from '../../application/use-cases/list-appointments.use-case';
import { RescheduleAppointmentUseCase } from '../../application/use-cases/reschedule-appointment.use-case';
import { ScheduleAppointmentUseCase } from '../../application/use-cases/schedule-appointment.use-case';

function actorOf(user: AuthenticatedUser | undefined): AppointmentActor {
  if (!user) throw new UnauthorizedException('Autenticación requerida');
  return { userId: user.id, role: user.role };
}

/** EJECUTIVO gestiona sus citas; SUPERVISOR y ADMIN todas (la regla vive en los casos de uso). */
@ApiTags('Citas')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly listAppointments: ListAppointmentsUseCase,
    private readonly getAgenda: GetAgendaUseCase,
    private readonly schedule: ScheduleAppointmentUseCase,
    private readonly rescheduleAppointment: RescheduleAppointmentUseCase,
    private readonly complete: CompleteAppointmentUseCase,
    private readonly cancel: CancelAppointmentUseCase,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(ListAppointmentsQuerySchema)) query: ListAppointmentsQuery,
  ): Promise<Paginated<AppointmentDto>> {
    return this.listAppointments.execute({ query, actor: actorOf(user) });
  }

  @Get('agenda')
  agenda(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(AgendaQuerySchema)) query: AgendaQuery,
  ): Promise<AppointmentDto[]> {
    return this.getAgenda.execute({ query, actor: actorOf(user) });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(ScheduleAppointmentSchema)) body: ScheduleAppointmentCommand,
  ): Promise<AppointmentDto> {
    return this.schedule.execute({ data: body, actor: actorOf(user) });
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(RescheduleAppointmentSchema)) body: RescheduleAppointmentCommand,
  ): Promise<RescheduleResultDto> {
    return this.rescheduleAppointment.execute({ id, data: body, actor: actorOf(user) });
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  completeAppointment(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CompleteAppointmentSchema)) body: CompleteAppointmentRequest,
  ): Promise<AppointmentDto> {
    return this.complete.execute({ id, outcome: body.outcome, actor: actorOf(user) });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelAppointment(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CancelAppointmentSchema)) body: CancelAppointmentRequest,
  ): Promise<AppointmentDto> {
    return this.cancel.execute({ id, reason: body.reason, actor: actorOf(user) });
  }
}
