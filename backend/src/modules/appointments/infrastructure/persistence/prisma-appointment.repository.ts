import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  type Appointment,
  type AppointmentRepository,
  concurrentAppointmentUpdate,
} from '../../domain';
import { toAggregate } from './appointment.mapper';

const FK_VIOLATION = 'P2003';

@Injectable()
export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<Appointment | null> {
    const row = await this.prisma.db.appointment.findUnique({ where: { id } });
    return row ? toAggregate(row) : null;
  }

  async insert(appointment: Appointment): Promise<void> {
    try {
      const created = await this.prisma.db.appointment.create({
        data: {
          companyId: appointment.companyId,
          userId: appointment.userId,
          scheduledAt: appointment.scheduledAt,
          mode: appointment.mode,
          location: appointment.location,
          status: appointment.status,
          notes: appointment.notes,
        },
        select: { id: true },
      });
      appointment.assignId(created.id);
    } catch (error) {
      if ((error as { code?: string }).code === FK_VIOLATION) {
        throw DomainError.validation(
          'APPOINTMENT_REFERENCE_NOT_FOUND',
          'La empresa o el usuario indicado no existe',
        );
      }
      throw error;
    }
  }

  async save(appointment: Appointment): Promise<void> {
    // Solo las citas PROGRAMADA pueden cambiar: la condición protege de escrituras concurrentes.
    const { count } = await this.prisma.db.appointment.updateMany({
      where: { id: appointment.id as number, status: 'PROGRAMADA' },
      data: {
        status: appointment.status,
        notes: appointment.notes,
        scheduledAt: appointment.scheduledAt,
        mode: appointment.mode,
        location: appointment.location,
      },
    });
    if (count === 0) throw concurrentAppointmentUpdate();
  }
}
