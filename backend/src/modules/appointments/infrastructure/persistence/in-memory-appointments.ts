import type { AppointmentDto, Paginated } from '@axiom/contracts';
import {
  type Appointment,
  type AppointmentListCriteria,
  type AppointmentReader,
  type AppointmentRepository,
  concurrentAppointmentUpdate,
} from '../../domain';
import { toAggregate, toDto } from './appointment.mapper';

/** Repositorio + lector en memoria para tests (mismo contrato que los adaptadores Prisma). */
export class InMemoryAppointmentStore implements AppointmentRepository, AppointmentReader {
  rows = new Map<number, ReturnType<typeof snapshot>>();
  companyNames = new Map<number, string>();
  private seq = 0;

  reset(): void {
    this.rows.clear();
    this.seq = 0;
  }

  async findById(id: number): Promise<Appointment | null> {
    const row = this.rows.get(id);
    return row ? toAggregate(row) : null;
  }

  async insert(appointment: Appointment): Promise<void> {
    const id = ++this.seq;
    appointment.assignId(id);
    this.rows.set(id, snapshot(appointment));
  }

  async save(appointment: Appointment): Promise<void> {
    const id = appointment.id as number;
    if (this.rows.get(id)?.status !== 'PROGRAMADA') throw concurrentAppointmentUpdate();
    this.rows.set(id, snapshot(appointment));
  }

  async getById(id: number): Promise<AppointmentDto | null> {
    return this.dto(this.rows.get(id));
  }

  async list(c: AppointmentListCriteria): Promise<Paginated<AppointmentDto>> {
    const all = this.filter(c);
    const start = (c.page - 1) * c.pageSize;
    return {
      items: all.slice(start, start + c.pageSize).map((r) => this.dto(r) as AppointmentDto),
      page: c.page,
      pageSize: c.pageSize,
      total: all.length,
    };
  }

  async agenda(c: { userId: number | undefined; from: Date; to: Date }): Promise<AppointmentDto[]> {
    return this.filter(c).map((r) => this.dto(r) as AppointmentDto);
  }

  private filter(c: {
    userId?: number;
    companyId?: number;
    status?: string;
    from?: Date;
    to?: Date;
  }) {
    return [...this.rows.values()]
      .filter(
        (r) =>
          (c.userId === undefined || r.userId === c.userId) &&
          (c.companyId === undefined || r.companyId === c.companyId) &&
          (c.status === undefined || r.status === c.status) &&
          (!c.from || r.scheduledAt >= c.from) &&
          (!c.to || r.scheduledAt < c.to),
      )
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id - b.id);
  }

  private dto(row: ReturnType<typeof snapshot> | undefined): AppointmentDto | null {
    if (!row) return null;
    const name = this.companyNames.get(row.companyId);
    return toDto(row, name ? { legalName: name } : null);
  }
}

function snapshot(a: Appointment) {
  return {
    id: a.id as number,
    companyId: a.companyId,
    userId: a.userId,
    scheduledAt: a.scheduledAt,
    mode: a.mode,
    location: a.location,
    status: a.status,
    notes: a.notes,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
