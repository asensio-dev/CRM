import {
  CONTRACT_CURRENCIES,
  type ContractCurrency,
  type ContractStatus,
  type CreateContractRequest,
  type UpdateContractDraftRequest,
} from '@axiom/contracts';
import { z } from 'zod';

// ───────────────────────────── estados ─────────────────────────────

/** Acciones de estado disponibles. BORRADOR → ENVIADO → FIRMADO → ACTIVO; CANCELADO desde no finales. */
export function nextStatusActions(status: ContractStatus): ContractStatus[] {
  switch (status) {
    case 'BORRADOR':
      return ['ENVIADO', 'CANCELADO'];
    case 'ENVIADO':
      return ['FIRMADO', 'CANCELADO'];
    case 'FIRMADO':
      return ['ACTIVO', 'CANCELADO'];
    case 'ACTIVO':
      return ['CANCELADO'];
    default:
      // CANCELADO y VENCIDO son finales (VENCIDO lo calcula el sistema).
      return [];
  }
}

export const canEditContract = (status: ContractStatus) => status === 'BORRADOR';

export const STATUS_ACTION_LABELS: Partial<Record<ContractStatus, string>> = {
  ENVIADO: 'Marcar como enviado',
  FIRMADO: 'Marcar como firmado',
  ACTIVO: 'Activar contrato',
  CANCELADO: 'Cancelar contrato',
};

/** Qué pasa con el pipeline de la empresa al aplicar la acción (se muestra antes de confirmar). */
export const STATUS_SIDE_EFFECTS: Partial<Record<ContractStatus, string>> = {
  ENVIADO: "La empresa pasará a 'En proceso de contrato' (si aún no lo está).",
  FIRMADO: 'No cambia el estado de la empresa en el pipeline.',
  ACTIVO: "La empresa pasará a 'Contrato activo' y saldrá de la rotación de prospección.",
  CANCELADO:
    'Esta acción es definitiva. La empresa conserva su estado actual en el pipeline: si hace falta, muévela desde el pipeline.',
};

/** Mensaje de éxito tras la transición. */
export const STATUS_SUCCESS: Partial<Record<ContractStatus, string>> = {
  ENVIADO: 'Contrato enviado. La empresa pasó a En proceso de contrato.',
  FIRMADO: 'Contrato firmado.',
  ACTIVO: 'Contrato activado. La empresa pasó a Contrato activo.',
  CANCELADO: 'Contrato cancelado.',
};

export const STATUS_BADGE: Record<ContractStatus, string> = {
  BORRADOR:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30',
  ENVIADO:
    'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  FIRMADO:
    'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30',
  ACTIVO:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  CANCELADO:
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  VENCIDO:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
};

export const CURRENCY_LABELS: Record<ContractCurrency, string> = {
  NIO: 'Córdobas (NIO)',
  USD: 'Dólares (USD)',
};

// ───────────────────────────── formulario ─────────────────────────────

/** Mismo patrón que `MoneyAmountSchema` de los contratos: texto decimal, nunca float. */
export const AMOUNT_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;

export function normalizeAmountInput(value: string): string {
  const [int = '0', frac = ''] = value.trim().split('.');
  return `${int.replace(/^0+(?=\d)/, '')}.${frac.padEnd(2, '0')}`;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica una fecha válida.');

export const ContractFormSchema = z
  .object({
    company: z.object({ id: z.number(), name: z.string() }, { error: 'Selecciona la empresa.' }),
    startDate: day,
    endDate: z.union([day, z.literal('')]),
    amount: z
      .string()
      .trim()
      .regex(AMOUNT_PATTERN, 'Monto inválido: usa números con hasta 2 decimales (ej. 1500.50).'),
    currency: z.enum(CONTRACT_CURRENCIES),
    notes: z.string().trim().max(2000, 'Máximo 2000 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.startDate && v.endDate < v.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'La fecha de fin no puede ser anterior a la de inicio.',
      });
    }
  });
export type ContractFormValues = z.infer<typeof ContractFormSchema>;

export function toCreateRequest(v: ContractFormValues): CreateContractRequest {
  return {
    companyId: v.company.id,
    startDate: v.startDate,
    endDate: v.endDate || undefined,
    amount: normalizeAmountInput(v.amount),
    currency: v.currency,
    notes: v.notes || undefined,
  };
}

export function toUpdateRequest(v: ContractFormValues): UpdateContractDraftRequest {
  return {
    startDate: v.startDate,
    endDate: v.endDate || null,
    amount: normalizeAmountInput(v.amount),
    currency: v.currency,
    notes: v.notes || null,
  };
}
