import {
  APPOINTMENT_MODES,
  type AppointmentDto,
  type AppointmentMode,
  type ScheduleAppointmentRequest,
} from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { managuaLocalToIso } from '@/shared/lib/managua-time';
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
import { appointmentErrorMessage } from './errors';
import { MODE_LABELS } from './labels';
import { useScheduleAppointment } from './queries';

export const ScheduleFormSchema = z
  .object({
    company: z.object({ id: z.number(), name: z.string() }, { error: 'Selecciona la empresa.' }),
    scheduledAt: z.string().min(1, 'Indica la fecha y hora de la cita.'),
    mode: z.enum(APPOINTMENT_MODES),
    location: z.string().trim().max(300, 'Máximo 300 caracteres.'),
    notes: z.string().trim().max(2000, 'Máximo 2000 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.scheduledAt) {
      const at = new Date(managuaLocalToIso(v.scheduledAt));
      if (Number.isNaN(at.getTime())) {
        ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Fecha no válida.' });
      } else if (at.getTime() <= Date.now()) {
        ctx.addIssue({
          code: 'custom',
          path: ['scheduledAt'],
          message: 'La cita debe ser en una fecha y hora futuras.',
        });
      }
    }
    if (v.mode === 'PRESENCIAL' && !v.location) {
      ctx.addIssue({
        code: 'custom',
        path: ['location'],
        message: 'El lugar es obligatorio en citas presenciales.',
      });
    }
  });
export type ScheduleFormValues = z.infer<typeof ScheduleFormSchema>;

export function toScheduleRequest(v: ScheduleFormValues): ScheduleAppointmentRequest {
  return {
    companyId: v.company.id,
    scheduledAt: managuaLocalToIso(v.scheduledAt),
    mode: v.mode,
    location: v.location || undefined,
    notes: v.notes || undefined,
  };
}

export interface ScheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Empresa preseleccionada (p. ej. desde su ficha); el selector queda bloqueado. */
  companyId?: number;
  companyName?: string;
  onScheduled?: (appointment: AppointmentDto) => void;
}

export function ScheduleAppointmentDialog(props: ScheduleAppointmentDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <ScheduleForm {...props} onClose={() => props.onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({
  companyId,
  companyName,
  onScheduled,
  onClose,
}: ScheduleAppointmentDialogProps & { onClose: () => void }) {
  const uid = useId();
  const mutation = useScheduleAppointment();
  const preselected = companyId !== undefined;
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(ScheduleFormSchema),
    defaultValues: {
      company:
        companyId !== undefined
          ? { id: companyId, name: companyName ?? `Empresa ${companyId}` }
          : (undefined as unknown as ScheduleFormValues['company']),
      scheduledAt: '',
      mode: 'PRESENCIAL' as AppointmentMode,
      location: '',
      notes: '',
    },
  });
  const mode = watch('mode');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const appointment = await mutation.mutateAsync(toScheduleRequest(values));
      toast.success(`Cita agendada con ${values.company.name}.`);
      onScheduled?.(appointment);
      onClose();
    } catch (err) {
      toast.error(appointmentErrorMessage(err));
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Agendar cita</DialogTitle>
        <DialogDescription>
          La empresa debe estar en “Con respuesta”; al agendar pasa a “Agendando cita”.
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
              disabled={preselected}
              clearable={!preselected}
            />
          )}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${uid}-at`}
          label="Fecha y hora (Managua)"
          error={errors.scheduledAt?.message}
        >
          <Input
            id={`${uid}-at`}
            type="datetime-local"
            aria-invalid={errors.scheduledAt ? true : undefined}
            {...register('scheduledAt')}
          />
        </FormField>
        <FormField id={`${uid}-mode`} label="Modalidad">
          <NativeSelect id={`${uid}-mode`} {...register('mode')}>
            {APPOINTMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField
        id={`${uid}-loc`}
        label={mode === 'PRESENCIAL' ? 'Lugar' : 'Lugar o enlace (opcional)'}
        error={errors.location?.message}
      >
        <Input
          id={`${uid}-loc`}
          maxLength={300}
          aria-invalid={errors.location ? true : undefined}
          placeholder={
            mode === 'VIRTUAL' ? 'Enlace de la reunión' : 'Dirección o punto de encuentro'
          }
          {...register('location')}
        />
      </FormField>
      <FormField id={`${uid}-notes`} label="Notas (opcional)" error={errors.notes?.message}>
        <Textarea id={`${uid}-notes`} maxLength={2000} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Agendando…' : 'Agendar cita'}
        </Button>
      </DialogFooter>
    </form>
  );
}
