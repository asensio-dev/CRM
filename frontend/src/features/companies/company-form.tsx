import { type CompanyDetail, type CreateCompanySchema } from '@axiom/contracts';
import { useState } from 'react';
import { Controller, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { Combobox, type ComboboxOption } from '@/shared/ui/combobox';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { useActivities, useSectors } from './queries';

/** Valores del formulario (entrada de CreateCompanySchema). En edición `ruc` no se usa. */
export type CompanyFormValues = z.input<typeof CreateCompanySchema>;

export const EMPTY_COMPANY_FORM: CompanyFormValues = {
  ruc: '',
  legalName: '',
  tradeName: '',
  legalRepName: '',
  legalRepIdNumber: '',
  employeeCount: 0,
  phone: '',
  shippingAddress: '',
  particularAddress: '',
  sectorId: null,
  activityId: null,
};

export function companyToFormValues(c: CompanyDetail): CompanyFormValues {
  return {
    ruc: c.ruc,
    legalName: c.legalName,
    tradeName: c.tradeName ?? '',
    legalRepName: c.legalRepName ?? '',
    legalRepIdNumber: c.legalRepIdNumber ?? '',
    employeeCount: c.employeeCount,
    phone: c.phone ?? '',
    shippingAddress: c.shippingAddress ?? '',
    particularAddress: c.particularAddress ?? '',
    sectorId: c.sectorId,
    activityId: c.activityId,
  };
}

/** RUC normalizado en vivo: sin espacios ni guiones y en mayúsculas (igual que `normalizeRuc`). */
export function liveNormalizeRuc(v: string): string {
  return v.replace(/[\s-]/g, '').toUpperCase();
}

interface CompanyFieldsProps {
  form: UseFormReturn<CompanyFormValues>;
  idPrefix: string;
  showRuc?: boolean;
  showLegalRepId?: boolean;
  /** Actividad ya elegida (para mostrar su nombre en el combobox). */
  initialActivity?: ComboboxOption | null;
}

const msg = (errors: FieldErrors<CompanyFormValues>, k: keyof CompanyFormValues) =>
  errors[k]?.message as string | undefined;

export function CompanyFields({
  form,
  idPrefix,
  showRuc,
  showLegalRepId,
  initialActivity = null,
}: CompanyFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const sectors = useSectors();
  const sectorOptions = sectors.data ?? [];
  const [activity, setActivity] = useState<ComboboxOption | null>(initialActivity);
  const [activityQuery, setActivityQuery] = useState('');
  const debounced = useDebouncedValue(activityQuery, 250);
  const activities = useActivities(debounced.trim());
  const id = (k: string) => `${idPrefix}-${k}`;
  const field = (k: keyof CompanyFormValues) => ({
    id: id(k),
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `${id(k)}-error` : undefined,
  });

  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-foreground">Identificación</legend>
        {showRuc && (
          <FormField
            id={id('ruc')}
            label="RUC"
            error={msg(errors, 'ruc')}
            hint="Sin espacios ni guiones."
          >
            <Input
              {...field('ruc')}
              autoComplete="off"
              {...register('ruc', {
                onChange: (e) => {
                  e.target.value = liveNormalizeRuc(e.target.value);
                },
              })}
            />
          </FormField>
        )}
        <FormField id={id('legalName')} label="Razón social" error={msg(errors, 'legalName')}>
          <Input {...field('legalName')} {...register('legalName')} />
        </FormField>
        <FormField id={id('tradeName')} label="Nombre comercial" error={msg(errors, 'tradeName')}>
          <Input {...field('tradeName')} {...register('tradeName')} />
        </FormField>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Contacto y clasificación
        </legend>
        <FormField id={id('phone')} label="Teléfono" error={msg(errors, 'phone')}>
          <Input type="tel" {...field('phone')} {...register('phone')} />
        </FormField>
        <FormField id={id('employeeCount')} label="Empleados" error={msg(errors, 'employeeCount')}>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            {...field('employeeCount')}
            {...register('employeeCount')}
          />
        </FormField>
        <FormField id={id('sectorId')} label="Sector" error={msg(errors, 'sectorId')}>
          <Controller
            control={control}
            name="sectorId"
            render={({ field: f }) => (
              <SearchableSelect
                id={id('sectorId')}
                value={
                  sectorOptions.find((o) => o.id === f.value) ??
                  (f.value ? { id: f.value, name: 'Cargando…' } : null)
                }
                onChange={(o) => f.onChange(o?.id ?? null)}
                options={sectorOptions}
                isLoading={sectors.isPending}
                placeholder="Sin sector"
                searchPlaceholder="Buscar sector…"
                invalid={!!errors.sectorId}
              />
            )}
          />
        </FormField>
        <FormField
          id={id('activityId')}
          label="Actividad económica"
          error={msg(errors, 'activityId')}
        >
          <Controller
            control={control}
            name="activityId"
            render={({ field: f }) => (
              <Combobox
                id={id('activityId')}
                value={activity}
                onChange={(o) => {
                  setActivity(o);
                  f.onChange(o?.id ?? null);
                }}
                options={activities.data ?? []}
                query={activityQuery}
                onQueryChange={setActivityQuery}
                isLoading={activities.isFetching}
                placeholder="Sin actividad"
                searchPlaceholder="Buscar actividad…"
                invalid={!!errors.activityId}
              />
            )}
          />
        </FormField>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Representante y direcciones
        </legend>
        <FormField
          id={id('legalRepName')}
          label="Representante legal"
          error={msg(errors, 'legalRepName')}
        >
          <Input {...field('legalRepName')} {...register('legalRepName')} />
        </FormField>
        {showLegalRepId && (
          <FormField
            id={id('legalRepIdNumber')}
            label="Cédula del representante"
            error={msg(errors, 'legalRepIdNumber')}
          >
            <Input {...field('legalRepIdNumber')} {...register('legalRepIdNumber')} />
          </FormField>
        )}
        <FormField
          id={id('shippingAddress')}
          label="Dirección de envío"
          error={msg(errors, 'shippingAddress')}
          className="sm:col-span-2"
        >
          <Input {...field('shippingAddress')} {...register('shippingAddress')} />
        </FormField>
        <FormField
          id={id('particularAddress')}
          label="Dirección particular"
          error={msg(errors, 'particularAddress')}
          className="sm:col-span-2"
        >
          <Input {...field('particularAddress')} {...register('particularAddress')} />
        </FormField>
      </fieldset>
    </div>
  );
}
