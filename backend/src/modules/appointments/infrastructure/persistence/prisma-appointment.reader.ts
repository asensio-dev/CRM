import type { AppointmentDto, Paginated } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { AppointmentListCriteria, AppointmentReader } from '../../domain';
import { toDto } from './appointment.mapper';

const WITH_COMPANY = { company: { select: { legalName: true } } } as const;
const AGENDA_LIMIT = 500;

interface Filter {
  userId?: number;
  companyId?: number;
  status?: string;
  from?: Date;
  to?: Date;
}

export function buildWhere(f: Filter) {
  return {
    ...(f.userId !== undefined && { userId: f.userId }),
    ...(f.companyId !== undefined && { companyId: f.companyId }),
    ...(f.status !== undefined && { status: f.status }),
    ...((f.from || f.to) && {
      scheduledAt: { ...(f.from && { gte: f.from }), ...(f.to && { lt: f.to }) },
    }),
  };
}

@Injectable()
export class PrismaAppointmentReader implements AppointmentReader {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: number): Promise<AppointmentDto | null> {
    const row = await this.prisma.db.appointment.findUnique({
      where: { id },
      include: WITH_COMPANY,
    });
    return row ? toDto(row, row.company) : null;
  }

  async list(criteria: AppointmentListCriteria): Promise<Paginated<AppointmentDto>> {
    const where = buildWhere(criteria);
    const db = this.prisma.db;
    const [total, rows] = await Promise.all([
      db.appointment.count({ where }),
      db.appointment.findMany({
        where,
        include: WITH_COMPANY,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => toDto(r, r.company)),
      page: criteria.page,
      pageSize: criteria.pageSize,
      total,
    };
  }

  async agenda(criteria: {
    userId: number | undefined;
    from: Date;
    to: Date;
  }): Promise<AppointmentDto[]> {
    const rows = await this.prisma.db.appointment.findMany({
      where: buildWhere(criteria),
      include: WITH_COMPANY,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: AGENDA_LIMIT,
    });
    return rows.map((r) => toDto(r, r.company));
  }
}
