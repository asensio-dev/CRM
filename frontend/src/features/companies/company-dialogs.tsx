import {
  type CompanyDetail,
  CreateBranchSchema,
  CreateCompanySchema,
  UpdateCompanySchema,
} from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FieldValues, type UseFormReturn, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import '@/shared/lib/zod-es';
import { HttpError } from '@/shared/api';
import { errorMessage, fieldErrorsFromApi } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import {
  CompanyFields,
  type CompanyFormValues,
  companyToFormValues,
  EMPTY_COMPANY_FORM,
} from './company-form';
import { useAddBranch, useCreateCompany, useUpdateCompany } from './queries';

/**
 * Vuelca los errores del API en el formulario. Devuelve un mensaje general
 * si el error no corresponde a ningún campo.
 */
function applyServerError<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  ducplicatedField?: string,
): string | null {
  if (error instanceof HttpError) {
    if (error.code === 'COMPANY_RUC_DUPLICATED' && ducplicatedField) {
      form.setError(ducplicatedField as never, {
        message: 'Ya existe una empresa con este RUC.',
      });
      return null;
    }
    const fields = fieldErrorsFromApi(error);
    const entries = Object.entries(fields);
    if (entries.length > 0) {
      for (const [name, message] of entries) form.setError(name as never, { message });
      return null;
    }
  }
  return errorMessage(error, 'No se pudo guardar. Inténtalo de nuevo.');
}

function SubmitFooter({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button variant="outline" onClick={onCancel} disabled={pending}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {label}
      </Button>
    </DialogFooter>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

// ───────────────────────────── Nueva empresa ─────────────────────────────

export interface CreateCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Alta manual. Al guardar muestra un toast y navega a `/empresas/$companyId`. */
export function CreateCompanyDialog({ open, onOpenChange }: CreateCompanyDialogProps) {
  const navigate = useNavigate();
  const create = useCreateCompany();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CompanyFormValues, unknown, z.output<typeof CreateCompanySchema>>({
    resolver: zodResolver(CreateCompanySchema),
    defaultValues: EMPTY_COMPANY_FORM,
  });

  useEffect(() => {
    if (open) {
      form.reset(EMPTY_COMPANY_FORM);
      setFormError(null);
    }
  }, [open, form]);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const company = await create.mutateAsync(values);
      toast.success(`Empresa creada: ${company.legalName}`);
      onOpenChange(false);
      void navigate({ to: '/empresas/$companyId', params: { companyId: company.id } });
    } catch (err) {
      setFormError(applyServerError(form as never, err, 'ruc'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva empresa</DialogTitle>
          <DialogDescription>
            Alta manual. Quedará en estado «Por contactar». El RUC no se podrá cambiar después.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <CompanyFields form={form as never} idPrefix="new-company" showRuc showLegalRepId />
          <FormError message={formError} />
          <SubmitFooter
            pending={form.formState.isSubmitting}
            label="Crear empresa"
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Editar empresa ─────────────────────────────

export interface EditCompanyDialogProps {
  /** Ficha actual (con `legalRepIdNumber` solo si el usuario puede verlo). */
  company: CompanyDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con la ficha actualizada tras guardar. */
  onSaved?: (company: CompanyDetail) => void;
}

/** Edita los datos de una empresa (no el RUC ni el estado). Actualiza la caché `companyKeys.detail(id)`. */
export function EditCompanyDialog({
  company,
  open,
  onOpenChange,
  onSaved,
}: EditCompanyDialogProps) {
  const update = useUpdateCompany(company.id);
  const [formError, setFormError] = useState<string | null>(null);
  const canSeeRepId = company.legalRepIdNumber !== undefined;
  const form = useForm<CompanyFormValues>({
    defaultValues: companyToFormValues(company),
  });

  useEffect(() => {
    if (open) {
      form.reset(companyToFormValues(company));
      setFormError(null);
    }
  }, [open, company, form]);

  const submit = form.handleSubmit(async (raw) => {
    setFormError(null);
    const { ruc: _ruc, legalRepIdNumber, ...rest } = raw;
    const candidate = canSeeRepId ? { ...rest, legalRepIdNumber } : rest;
    const parsed = UpdateCompanySchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const name = issue.path[0];
        if (typeof name === 'string') form.setError(name as never, { message: issue.message });
      }
      return;
    }
    try {
      const saved = await update.mutateAsync(parsed.data);
      toast.success('Empresa actualizada');
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setFormError(applyServerError(form as never, err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar empresa</DialogTitle>
          <DialogDescription>RUC {company.ruc} (no editable).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <CompanyFields
            form={form}
            idPrefix="edit-company"
            showLegalRepId={canSeeRepId}
            initialActivity={
              company.activityId && company.activityName
                ? { id: company.activityId, name: company.activityName }
                : null
            }
          />
          <FormError message={formError} />
          <SubmitFooter
            pending={form.formState.isSubmitting}
            label="Guardar cambios"
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Agregar sucursal ─────────────────────────────

export interface AddBranchDialogProps {
  companyId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con la ficha actualizada (incluye la nueva sucursal). */
  onAdded?: (company: CompanyDetail) => void;
}

type BranchFormValues = z.input<typeof CreateBranchSchema>;
const EMPTY_BRANCH: BranchFormValues = { tradeName: '', address: '', phone: '', employeeCount: 0 };

/** Agrega una sucursal a la empresa. Actualiza la caché `companyKeys.detail(companyId)`. */
export function AddBranchDialog({ companyId, open, onOpenChange, onAdded }: AddBranchDialogProps) {
  const add = useAddBranch(companyId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<BranchFormValues, unknown, z.output<typeof CreateBranchSchema>>({
    resolver: zodResolver(CreateBranchSchema),
    defaultValues: EMPTY_BRANCH,
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(EMPTY_BRANCH);
      setFormError(null);
    }
  }, [open, form]);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await add.mutateAsync(values);
      toast.success('Sucursal agregada');
      onAdded?.(saved);
      onOpenChange(false);
    } catch (err) {
      setFormError(applyServerError(form as never, err));
    }
  });

  const field = (k: keyof BranchFormValues) => ({
    id: `branch-${k}`,
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `branch-${k}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar sucursal</DialogTitle>
          <DialogDescription>Todos los campos son opcionales.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormField
            id="branch-tradeName"
            label="Nombre comercial"
            error={errors.tradeName?.message}
          >
            <Input {...field('tradeName')} {...form.register('tradeName')} />
          </FormField>
          <FormField id="branch-address" label="Dirección" error={errors.address?.message}>
            <Input {...field('address')} {...form.register('address')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="branch-phone" label="Teléfono" error={errors.phone?.message}>
              <Input type="tel" {...field('phone')} {...form.register('phone')} />
            </FormField>
            <FormField
              id="branch-employeeCount"
              label="Empleados"
              error={errors.employeeCount?.message}
            >
              <Input
                type="number"
                min={0}
                {...field('employeeCount')}
                {...form.register('employeeCount')}
              />
            </FormField>
          </div>
          <FormError message={formError} />
          <SubmitFooter
            pending={form.formState.isSubmitting}
            label="Agregar"
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
