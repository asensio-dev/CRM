import type { RescheduleAppointmentCommand, RescheduleResultDto } from '@axiom/contracts';
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

export interface RescheduleAppointmentInput {
  id: number;
  data: RescheduleAppointmentCommand;
  actor: AppointmentActor;
}

/**
 * Reprogramar = la cita original queda REPROGRAMADA (histórico) y se crea una cita nueva
 * PROGRAMADA con la fecha nueva. No toca el pipeline (la empresa ya está en AGENDANDO_CITA o más).
 */
@Injectable()
export class RescheduleAppointmentUseCase
  implements UseCase<RescheduleAppointmentInput, RescheduleResultDto>
{
  constructor(
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(APPOINTMENT_READER) private readonly reader: AppointmentReader,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ id, data, actor }: RescheduleAppointmentInput): Promise<RescheduleResultDto> {
    const { previous, next } = await this.uow.run(
      async (): Promise<{ previous: Appointment; next: Appointment }> => {
        const found = await this.appointments.findById(id);
        if (!found) throw appointmentNotFound(id);
        assertCanManage(actor, found);
        const created = found.reschedule(data, this.clock.now());
        await this.appointments.save(found);
        await this.appointments.insert(created);
        return { previous: found, next: created };
      },
    );
    await this.events.publishAll([...previous.pullEvents(), ...next.pullEvents()]);
    const [before, after] = await Promise.all([
      this.reader.getById(id),
      this.reader.getById(next.id as number),
    ]);
    return {
      previous: before as RescheduleResultDto['previous'],
      appointment: after as RescheduleResultDto['appointment'],
    };
  }
}
