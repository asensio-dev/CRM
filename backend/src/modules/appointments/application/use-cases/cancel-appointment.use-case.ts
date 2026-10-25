import type { AppointmentDto } from '@axiom/contracts';
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
  type Appointment,
  type AppointmentReader,
  type AppointmentRepository,
  appointmentNotFound,
} from '../../domain';
import { type AppointmentActor, assertCanManage } from '../actor';

export interface CancelAppointmentInput {
  id: number;
  reason?: string | null;
  actor: AppointmentActor;
}

/** Cancela una cita PROGRAMADA. No retrocede el pipeline (eso lo decide el usuario en el tablero). */
@Injectable()
export class CancelAppointmentUseCase implements UseCase<CancelAppointmentInput, AppointmentDto> {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(APPOINTMENT_READER) private readonly reader: AppointmentReader,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ id, reason, actor }: CancelAppointmentInput): Promise<AppointmentDto> {
    const appointment: Appointment = await this.uow.run(async () => {
      const found = await this.appointments.findById(id);
      if (!found) throw appointmentNotFound(id);
      assertCanManage(actor, found);
      found.cancel(reason, this.clock.now());
      await this.appointments.save(found);
      return found;
    });
    await this.events.publishAll(appointment.pullEvents());
    return (await this.reader.getById(id)) as AppointmentDto;
  }
}
