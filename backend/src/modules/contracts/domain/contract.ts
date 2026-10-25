import type { ContractCurrency, ContractStatus } from '@axiom/contracts';
import { AggregateRoot, DomainError } from '../../../shared/domain';
import { ContractCreated, ContractStatusChanged } from './events';

export const MAX_NOTES = 2000;

/** Fecha calendario `YYYY-MM-DD` (comparable como texto). */
export type CalendarDate = string;

const AMOUNT_RE = /^\d{1,16}(\.\d{1,2})?$/;

/** Monto como string decimal con 2 decimales: nunca se usa float para dinero. */
export function normalizeAmount(raw: string): string {
  const value = raw.trim();
  if (!AMOUNT_RE.test(value)) {
    throw DomainError.validation(
      'CONTRACT_INVALID_AMOUNT',
      'El monto debe ser un decimal no negativo con hasta 2 decimales',
    );
  }
  const [int = '0', frac = ''] = value.split('.');
  return `${int.replace(/^0+(?=\d)/, '')}.${frac.padEnd(2, '0')}`;
}

/** Hoy en Nicaragua (UTC-6, sin horario de verano) como `YYYY-MM-DD`. */
export function todayInNicaragua(now: Date): CalendarDate {
  return new Date(now.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Transiciones manuales. VENCIDO no está: lo calcula el sistema (ACTIVO con endDate pasada).
 *   BORRADOR → ENVIADO → FIRMADO → ACTIVO ;  CANCELADO desde cualquier estado no final.
 */
const NEXT: Record<ContractStatus, readonly ContractStatus[]> = {
  BORRADOR: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['FIRMADO', 'CANCELADO'],
  FIRMADO: ['ACTIVO', 'CANCELADO'],
  ACTIVO: ['CANCELADO'],
  CANCELADO: [],
  VENCIDO: [],
};

export interface ContractProps {
  companyId: number;
  code: string | null;
  startDate: CalendarDate;
  endDate: CalendarDate | null;
  amount: string;
  currency: ContractCurrency;
  status: ContractStatus;
  notes: string | null;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewContractInput {
  companyId: number;
  startDate: CalendarDate;
  endDate?: CalendarDate | null;
  amount: string;
  currency: ContractCurrency;
  notes?: string | null;
  createdById: number;
}

export interface DraftPatch {
  startDate?: CalendarDate;
  endDate?: CalendarDate | null;
  amount?: string;
  currency?: ContractCurrency;
  notes?: string | null;
}

export class Contract extends AggregateRoot {
  private constructor(
    id: number | null,
    private props: ContractProps,
  ) {
    super(id);
  }

  static create(input: NewContractInput, now: Date): Contract {
    const dates = Contract.validDates(input.startDate, input.endDate ?? null);
    const contract = new Contract(null, {
      companyId: input.companyId,
      code: null,
      ...dates,
      amount: normalizeAmount(input.amount),
      currency: input.currency,
      status: 'BORRADOR',
      notes: Contract.validNotes(input.notes),
      createdById: input.createdById,
      createdAt: now,
      updatedAt: now,
    });
    contract.record(new ContractCreated(input.companyId, input.createdById, now));
    return contract;
  }

  static rehydrate(id: number, props: ContractProps): Contract {
    return new Contract(id, props);
  }

  get companyId(): number {
    return this.props.companyId;
  }
  get code(): string | null {
    return this.props.code;
  }
  get startDate(): CalendarDate {
    return this.props.startDate;
  }
  get endDate(): CalendarDate | null {
    return this.props.endDate;
  }
  get amount(): string {
    return this.props.amount;
  }
  get currency(): ContractCurrency {
    return this.props.currency;
  }
  /** Estado almacenado (sin la regla de vencimiento). */
  get storedStatus(): ContractStatus {
    return this.props.status;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get createdById(): number {
    return this.props.createdById;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  assignIdentity(id: number, code: string): void {
    this._id = id;
    this.props = { ...this.props, code };
  }

  /** Estado efectivo: un contrato ACTIVO cuya `endDate` ya pasó es VENCIDO (regla de consulta). */
  effectiveStatus(today: CalendarDate): ContractStatus {
    const { status, endDate } = this.props;
    return status === 'ACTIVO' && endDate !== null && endDate < today ? 'VENCIDO' : status;
  }

  /** Solo en BORRADOR. Valida de nuevo la coherencia de fechas con el resultado final. */
  updateDraft(patch: DraftPatch, now: Date): void {
    if (this.props.status !== 'BORRADOR') {
      throw new DomainError(
        'CONTRACT_NOT_DRAFT',
        `Solo un contrato en BORRADOR es editable (estado actual: ${this.props.status})`,
        'RULE',
        { status: this.props.status },
      );
    }
    const startDate = patch.startDate ?? this.props.startDate;
    const endDate = patch.endDate === undefined ? this.props.endDate : patch.endDate;
    this.props = {
      ...this.props,
      ...Contract.validDates(startDate, endDate),
      amount: patch.amount === undefined ? this.props.amount : normalizeAmount(patch.amount),
      currency: patch.currency ?? this.props.currency,
      notes: patch.notes === undefined ? this.props.notes : Contract.validNotes(patch.notes),
      updatedAt: now,
    };
  }

  changeStatus(to: ContractStatus, today: CalendarDate, now: Date): void {
    const from = this.effectiveStatus(today);
    if (to === 'VENCIDO') {
      throw new DomainError(
        'CONTRACT_STATUS_SYSTEM_MANAGED',
        'VENCIDO lo calcula el sistema a partir de la fecha de fin',
        'RULE',
        { from, to },
      );
    }
    if (!NEXT[from].includes(to)) {
      throw new DomainError(
        'CONTRACT_INVALID_TRANSITION',
        `Transición no permitida: ${from} → ${to}`,
        'RULE',
        { from, to, allowed: NEXT[from] },
      );
    }
    if (to === 'ACTIVO' && this.props.endDate !== null && this.props.endDate < today) {
      throw new DomainError(
        'CONTRACT_ALREADY_EXPIRED',
        'No se puede activar un contrato cuya fecha de fin ya pasó',
        'RULE',
        { endDate: this.props.endDate },
      );
    }
    this.props = { ...this.props, status: to, updatedAt: now };
    this.record(new ContractStatusChanged(this.props.companyId, from, to, now));
  }

  private static validDates(startDate: CalendarDate, endDate: CalendarDate | null) {
    if (endDate !== null && endDate < startDate) {
      throw DomainError.validation(
        'CONTRACT_INVALID_DATES',
        'La fecha de fin no puede ser anterior a la de inicio',
        { startDate, endDate },
      );
    }
    return { startDate, endDate };
  }

  private static validNotes(notes: string | null | undefined): string | null {
    const value = notes?.trim() || null;
    if (value && value.length > MAX_NOTES) {
      throw DomainError.validation(
        'CONTRACT_NOTES_TOO_LONG',
        `Las notas admiten ${MAX_NOTES} caracteres`,
      );
    }
    return value;
  }
}
