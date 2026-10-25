import { CONTRACT_CURRENCIES, type ContractDto } from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { managuaDay } from '@/shared/lib/managua-time';
import { Button } from '@/shared/ui/button';
import { CompanyPicker } from '@/shared/ui/company-picker';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/modal-dialog';
import { NativeSelect } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/text-area';
import { contractErrorMessage } from './errors';
import {
  ContractFormSchema,
  type ContractFormValues,
  CURRENCY_LABELS,
  toCreateRequest,
  toUpdateRequest,
} from './logic';
import { useCreateContract, useUpdateContract } from './queries';

export interface CreateContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Empresa preseleccionada (p. ej. desde su ficha); el selector queda bloqueado. */
  companyId?: number;
  companyName?: string;
  onCreated?: (contract: ContractDto) => void;
}

export function CreateContractDialog(props: CreateContractDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <ContractForm
          companyId={props.companyId}
          companyName={props.companyName}
          onSaved={props.onCreated}
          onClose={() => props.onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditContractDialog({
  contract,
  open,
  onOpenChange,
}: {
  contract: ContractDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ContractForm contract={contract} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ContractForm({
  contract,
  companyId,
  companyName,
  onSaved,
  onClose,
}: {
  contract?: ContractDto;
  companyId?: number;
  companyName?: string;
  onSaved?: (c: ContractDto) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const create = useCreateContract();
  const update = useUpdateContract();
  const editing = contract !== undefined;
  const pending = create.isPending || update.isPending;
  const lockedCompany = editing || companyId !== undefined;
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(ContractFormSchema),
    defaultValues: {
      company: contract
        ? { id: contract.companyId, name: contract.companyName ?? `Empresa ${contract.companyId}` }
        : companyId !== undefined
          ? { id: companyId, name: companyName ?? `Empresa ${companyId}` }
          : (undefined as unknown as ContractFormValues['company']),
      startDate: contract?.startDate ?? managuaDay(),
      endDate: contract?.endDate ?? '',
      amount: contract?.amount ?? '',
      currency: contract?.currency ?? 'NIO',
      notes: contract?.notes ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = contract
        ? await update.mutateAsync({ id: contract.id, ...toUpdateRequest(values) })
        : await create.mutateAsync(toCreateRequest(values));
      toast.success(
        contract
          ? 'Contrato actualizado.'
          : `Contrato ${saved.code} creado. La empresa pasó a En proceso de contrato.`,
      );
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(contractErrorMessage(err));
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Editar contrato ${contract.code}` : 'Crear contrato'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Solo los contratos en borrador se pueden editar.'
            : "Se crea en borrador. La empresa debe estar en 'Agendando cita' o más avanzada y pasa a 'En proceso de contrato'."}
        </DialogDescription>
      </DialogHeader>
      <FormField id={`${uid}-company`} label="Empresa" error={errors.company?.message}>
        <Controller
          control={control}
          name="company"
          render={({ field }) => (
            <CompanyPicker
              id={`${uid}-company`}
              value={field.value ?? null}
              onChange={(o) => field.onChange(o ?? undefined)}
              invalid={!!errors.company}
              disabled={lockedCompany}
              clearable={!lockedCompany}
            />
          )}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${uid}-start`} label="Inicio" error={errors.startDate?.message}>
          <Input
            id={`${uid}-start`}
            type="date"
            aria-invalid={errors.startDate ? true : undefined}
            {...register('startDate')}
          />
        </FormField>
        <FormField id={`${uid}-end`} label="Fin (opcional)" error={errors.endDate?.message}>
          <Input
            id={`${uid}-end`}
            type="date"
            aria-invalid={errors.endDate ? true : undefined}
            {...register('endDate')}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <FormField
          id={`${uid}-amount`}
          label="Monto"
          error={errors.amount?.message}
          hint="Sin separador de miles; hasta 2 decimales (ej. 1500.50)."
        >
          <Input
            id={`${uid}-amount`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={errors.amount ? true : undefined}
            {...register('amount')}
          />
        </FormField>
        <FormField id={`${uid}-currency`} label="Moneda">
          <NativeSelect id={`${uid}-currency`} {...register('currency')}>
            {CONTRACT_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField id={`${uid}-notes`} label="Notas (opcional)" error={errors.notes?.message}>
        <Textarea id={`${uid}-notes`} maxLength={2000} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear contrato'}
        </Button>
      </DialogFooter>
    </form>
  );
}
