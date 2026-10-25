import type { AppointmentDto, ScheduleAppointmentCommand } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  EVENT_BUS,
  type EventBus,
  UNIT_OF_WORK,
  type UnitOfWork,
  type UseCase,
} from '../../../../shared/application';
import {
  APPOINTMENT_READER,
  APPOINTMENT_REPOSITORY,
  Appointment,
  type AppointmentReader,
  type AppointmentRepository,
  appointmentForbidden,
  COMPANY_PIPELINE_GATEWAY,
  type CompanyPipelineGateway,
} from '../../domain';
import { type AppointmentActor, isPrivileged } from '../actor';

export interface ScheduleAppointmentInput {
  data: ScheduleAppointmentCommand;
  actor: AppointmentActor;
}

/**
 * Agenda una cita. Regla de pipeline: la empresa debe estar CON_RESPUESTA (pasa a AGENDANDO_CITA)
 * o ya en AGENDANDO_CITA / EN_PROCESO_CONTRATO / CONTRATO_ACTIVO (sin cambio de estado);
 * cualquier otro estado se rechaza con APPOINTMENT_COMPANY_NOT_READY. Ver ADR 0005.
 * El cambio de estado y la cita se confirman en una sola transacción.
 */
@Injectable()
export class ScheduleAppointmentUseCase
  implements UseCase<ScheduleAppointmentInput, AppointmentDto>
{
  constructor(
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(APPOINTMENT_READER) private readonly reader: AppointmentReader,
    @Inject(COMPANY_PIPELINE_GATEWAY) private readonly pipeline: CompanyPipelineGateway,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ data, actor }: ScheduleAppointmentInput): Promise<AppointmentDto> {
    const ownerId = data.userId ?? actor.userId;
    if (ownerId !== actor.userId && !isPrivileged(actor)) throw appointmentForbidden();

    const appointment = Appointment.schedule(
      {
        companyId: data.companyId,
        userId: ownerId,
        scheduledAt: data.scheduledAt,
        mode: data.mode,
        location: data.location,
        notes: data.notes,
      },
      this.clock.now(),
    );

    await this.uow.run(async () => {
      await this.pipeline.advance({
        companyId: data.companyId,
        target: 'AGENDANDO_CITA',
        tolerated: ['AGENDANDO_CITA', 'EN_PROCESO_CONTRATO', 'CONTRATO_ACTIVO'],
        actor,
        note: 'Cita agendada',
      });
      await this.appointments.insert(appointment);
    });
    await this.events.publishAll(appointment.pullEvents());
    return (await this.reader.getById(appointment.id as number)) as AppointmentDto;
  }
}
