import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline';
import { CancelAppointmentUseCase } from './application/use-cases/cancel-appointment.use-case';
import { CompleteAppointmentUseCase } from './application/use-cases/complete-appointment.use-case';
import {
  GetAgendaUseCase,
  ListAppointmentsUseCase,
} from './application/use-cases/list-appointments.use-case';
import { RescheduleAppointmentUseCase } from './application/use-cases/reschedule-appointment.use-case';
import { ScheduleAppointmentUseCase } from './application/use-cases/schedule-appointment.use-case';
import { APPOINTMENT_READER, APPOINTMENT_REPOSITORY, COMPANY_PIPELINE_GATEWAY } from './domain';
import { AppointmentsController } from './infrastructure/http/appointments.controller';
import { PrismaAppointmentReader } from './infrastructure/persistence/prisma-appointment.reader';
import { PrismaAppointmentRepository } from './infrastructure/persistence/prisma-appointment.repository';
import { PipelineStatusGateway } from './infrastructure/pipeline/pipeline-status.gateway';

/** Citas. UNIT_OF_WORK, EVENT_BUS y CLOCK llegan del SharedModule global; el pipeline, de su API pública. */
@Module({
  imports: [PipelineModule],
  controllers: [AppointmentsController],
  providers: [
    { provide: APPOINTMENT_REPOSITORY, useClass: PrismaAppointmentRepository },
    { provide: APPOINTMENT_READER, useClass: PrismaAppointmentReader },
    { provide: COMPANY_PIPELINE_GATEWAY, useClass: PipelineStatusGateway },
    ScheduleAppointmentUseCase,
    RescheduleAppointmentUseCase,
    CompleteAppointmentUseCase,
    CancelAppointmentUseCase,
    ListAppointmentsUseCase,
    GetAgendaUseCase,
  ],
})
export class AppointmentsModule {}
