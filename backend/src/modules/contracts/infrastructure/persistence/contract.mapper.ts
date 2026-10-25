import type { ContractCurrency, ContractDto, ContractStatus } from '@axiom/contracts';
import { type CalendarDate, Contract } from '../../domain';

/** Fila de `contracts`; `amount` llega como Prisma.Decimal (solo se usa `toFixed`, nunca float). */
export interface ContractRow {
  id: number;
  companyId: number;
  code: string;
  startDate: Date;
  endDate: Date | null;
  amount: { toFixed(digits: number): string };
  currency: string;
  status: string;
  notes: string | null;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
}

export const toDbDate = (date: CalendarDate): Date => new Date(`${date}T00:00:00.000Z`);
export const fromDbDate = (date: Date): CalendarDate => date.toISOString().slice(0, 10);

export const toAggregate = (row: ContractRow): Contract =>
  Contract.rehydrate(row.id, {
    companyId: row.companyId,
    code: row.code,
    startDate: fromDbDate(row.startDate),
    endDate: row.endDate ? fromDbDate(row.endDate) : null,
    amount: row.amount.toFixed(2),
    currency: row.currency as ContractCurrency,
    status: row.status as ContractStatus,
    notes: row.notes,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const toDto = (
  row: ContractRow,
  company: { legalName: string } | null,
  today: CalendarDate,
): ContractDto => ({
  id: row.id,
  companyId: row.companyId,
  companyName: company?.legalName ?? null,
  code: row.code,
  startDate: fromDbDate(row.startDate),
  endDate: row.endDate ? fromDbDate(row.endDate) : null,
  amount: row.amount.toFixed(2),
  currency: row.currency as ContractCurrency,
  status: toAggregate(row).effectiveStatus(today),
  notes: row.notes,
  createdById: row.createdById,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** `CT-2026-000123` */
export const formatContractCode = (year: number, id: number): string =>
  `CT-${year}-${String(id).padStart(6, '0')}`;
