import type { ContractDto, Paginated } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { CalendarDate, ContractListCriteria, ContractReader } from '../../domain';
import { toDbDate, toDto } from './contract.mapper';

const WITH_COMPANY = { company: { select: { legalName: true } } } as const;

/** Traduce el estado EFECTIVO pedido a condiciones sobre el estado almacenado + `endDate`. */
export function statusWhere(status: string | undefined, today: CalendarDate) {
  const t = toDbDate(today);
  switch (status) {
    case undefined:
      return {};
    case 'VENCIDO':
      return { OR: [{ status: 'VENCIDO' }, { status: 'ACTIVO', endDate: { lt: t } }] };
    case 'ACTIVO':
      return { status: 'ACTIVO', OR: [{ endDate: null }, { endDate: { gte: t } }] };
    default:
      return { status };
  }
}

export function buildWhere(c: ContractListCriteria) {
  return {
    ...statusWhere(c.status, c.today),
    ...(c.companyId !== undefined && { companyId: c.companyId }),
    ...(c.createdById !== undefined && { createdById: c.createdById }),
    ...((c.startFrom || c.startTo) && {
      startDate: {
        ...(c.startFrom && { gte: toDbDate(c.startFrom) }),
        ...(c.startTo && { lte: toDbDate(c.startTo) }),
      },
    }),
  };
}

@Injectable()
export class PrismaContractReader implements ContractReader {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: number, today: CalendarDate): Promise<ContractDto | null> {
    const row = await this.prisma.db.contract.findUnique({ where: { id }, include: WITH_COMPANY });
    return row ? toDto(row, row.company, today) : null;
  }

  async list(criteria: ContractListCriteria): Promise<Paginated<ContractDto>> {
    const where = buildWhere(criteria);
    const db = this.prisma.db;
    const [total, rows] = await Promise.all([
      db.contract.count({ where }),
      db.contract.findMany({
        where,
        include: WITH_COMPANY,
        orderBy: [{ id: 'desc' }],
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => toDto(r, r.company, criteria.today)),
      page: criteria.page,
      pageSize: criteria.pageSize,
      total,
    };
  }
}
