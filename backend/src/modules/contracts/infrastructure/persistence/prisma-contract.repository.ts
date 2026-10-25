import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { type Contract, type ContractRepository, concurrentContractUpdate } from '../../domain';
import { formatContractCode, toAggregate, toDbDate } from './contract.mapper';

const FK_VIOLATION = 'P2003';

@Injectable()
export class PrismaContractRepository implements ContractRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<Contract | null> {
    const row = await this.prisma.db.contract.findUnique({ where: { id } });
    return row ? toAggregate(row) : null;
  }

  /**
   * El código legible se deriva del id identity (único por construcción, sin carreras):
   * se inserta con un código temporal único y se reemplaza por `CT-AAAA-NNNNNN` en la misma transacción.
   */
  async insert(contract: Contract, year: number): Promise<void> {
    const db = this.prisma.db;
    try {
      const created = await db.contract.create({
        data: {
          companyId: contract.companyId,
          code: `TMP-${randomUUID().replaceAll('-', '').slice(0, 20)}`,
          startDate: toDbDate(contract.startDate),
          endDate: contract.endDate ? toDbDate(contract.endDate) : null,
          amount: contract.amount,
          currency: contract.currency,
          status: contract.storedStatus,
          notes: contract.notes,
          createdById: contract.createdById,
        },
        select: { id: true },
      });
      const code = formatContractCode(year, created.id);
      await db.contract.update({ where: { id: created.id }, data: { code }, select: { id: true } });
      contract.assignIdentity(created.id, code);
    } catch (error) {
      if ((error as { code?: string }).code === FK_VIOLATION) {
        throw DomainError.validation(
          'CONTRACT_REFERENCE_NOT_FOUND',
          'La empresa indicada no existe',
        );
      }
      throw error;
    }
  }

  async save(contract: Contract): Promise<void> {
    // Bloqueo optimista sobre updatedAt no es viable (DateTime2 vs Date); se protege el estado final.
    const { count } = await this.prisma.db.contract.updateMany({
      where: { id: contract.id as number, status: { notIn: ['CANCELADO', 'VENCIDO'] } },
      data: {
        startDate: toDbDate(contract.startDate),
        endDate: contract.endDate ? toDbDate(contract.endDate) : null,
        amount: contract.amount,
        currency: contract.currency,
        status: contract.storedStatus,
        notes: contract.notes,
      },
    });
    if (count === 0) throw concurrentContractUpdate();
  }
}
