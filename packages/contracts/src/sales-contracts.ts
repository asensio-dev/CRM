import { z } from 'zod';

/** Deben coincidir con el CHECK `contracts_status_check`. */
export const CONTRACT_STATUSES = [
  'BORRADOR',
  'ENVIADO',
  'FIRMADO',
  'ACTIVO',
  'CANCELADO',
  'VENCIDO',
] as const;
export const ContractStatusSchema = z.enum(CONTRACT_STATUSES);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  BORRADOR: 'Borrador',
  ENVIADO: 'Enviado',
  FIRMADO: 'Firmado',
  ACTIVO: 'Activo',
  CANCELADO: 'Cancelado',
  VENCIDO: 'Vencido',
};

export const CONTRACT_CURRENCIES = ['NIO', 'USD'] as const;
export const ContractCurrencySchema = z.enum(CONTRACT_CURRENCIES);
export type ContractCurrency = z.infer<typeof ContractCurrencySchema>;

// ───────────────────────────── API del módulo contracts ─────────────────────────────
/**
 *   GET   /api/contracts             ListContractsQuery → Paginated<ContractDto>
 *   GET   /api/contracts/:id         → ContractDto
 *   POST  /api/contracts             CreateContractRequest → ContractDto (201)
 *   PATCH /api/contracts/:id         UpdateContractDraftRequest → ContractDto (solo BORRADOR)
 *   POST  /api/contracts/:id/status  ChangeContractStatusRequest → ContractDto
 *
 * `amount` viaja siempre como string decimal con 2 decimales ("1500.00"): nunca como float.
 * `status` de la respuesta es el estado EFECTIVO: un contrato ACTIVO con `endDate` pasada se muestra VENCIDO.
 * Errores: 404 CONTRACT_NOT_FOUND, 403 CONTRACT_FORBIDDEN, 422 CONTRACT_INVALID_TRANSITION /
 * CONTRACT_NOT_DRAFT / CONTRACT_COMPANY_NOT_READY / PIPELINE_INVALID_TRANSITION.
 */

const IdSchema = z.coerce.number().int().positive();

/** Fecha calendario `YYYY-MM-DD` (sin zona; los contratos son por día). */
export const CalendarDateSchema = z.iso.date();

/** Decimal con hasta 2 decimales, como texto. Se normaliza a 2 decimales ("5" → "5.00"). */
export const MoneyAmountSchema = z
  .string()
  .trim()
  .regex(
    /^\d{1,16}(\.\d{1,2})?$/,
    'Monto inválido: use un decimal no negativo con hasta 2 decimales',
  )
  .transform((v) => {
    const [int = '0', frac = ''] = v.split('.');
    return `${int.replace(/^0+(?=\d)/, '')}.${frac.padEnd(2, '0')}`;
  });

const NotesSchema = z.string().trim().min(1).max(2000);

export const CreateContractSchema = z
  .object({
    companyId: z.number().int().positive(),
    startDate: CalendarDateSchema,
    endDate: CalendarDateSchema.optional(),
    amount: MoneyAmountSchema,
    currency: ContractCurrencySchema.default('NIO'),
    notes: NotesSchema.optional(),
  })
  .refine((c) => !c.endDate || c.endDate >= c.startDate, {
    message: 'endDate no puede ser anterior a startDate',
    path: ['endDate'],
  });
export type CreateContractRequest = z.input<typeof CreateContractSchema>;
export type CreateContractCommand = z.output<typeof CreateContractSchema>;

export const UpdateContractDraftSchema = z
  .object({
    startDate: CalendarDateSchema,
    /** `null` quita la fecha de fin. */
    endDate: CalendarDateSchema.nullable(),
    amount: MoneyAmountSchema,
    currency: ContractCurrencySchema,
    notes: NotesSchema.nullable(),
  })
  .partial()
  .refine((c) => Object.keys(c).length > 0, { message: 'Indique al menos un campo' });
export type UpdateContractDraftRequest = z.input<typeof UpdateContractDraftSchema>;
export type UpdateContractDraftCommand = z.output<typeof UpdateContractDraftSchema>;

export const ChangeContractStatusSchema = z.object({
  /** VENCIDO no se puede pedir: lo calcula el sistema a partir de `endDate`. */
  to: ContractStatusSchema,
});
export type ChangeContractStatusRequest = z.input<typeof ChangeContractStatusSchema>;

export const ListContractsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: ContractStatusSchema.optional(),
  companyId: IdSchema.optional(),
  /** Contratos que empiezan desde esta fecha (inclusive). */
  startFrom: CalendarDateSchema.optional(),
  /** Contratos que empiezan hasta esta fecha (inclusive). */
  startTo: CalendarDateSchema.optional(),
});
export type ListContractsQuery = z.output<typeof ListContractsQuerySchema>;

export interface ContractDto {
  id: number;
  companyId: number;
  companyName: string | null;
  code: string;
  startDate: string;
  endDate: string | null;
  amount: string;
  currency: ContractCurrency;
  status: ContractStatus;
  notes: string | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
}
