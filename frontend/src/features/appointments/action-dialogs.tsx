import type { AppointmentDto } from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatAbsolute } from '@/shared/lib/format-date';
import { managuaLocalToIso } from '@/shared/lib/managua-time';
import { Button } from '@/shared/ui/button';
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
import { Textarea } from '@/shared/ui/text-area';
import { appointmentErrorMessage } from './errors';
import { useCancelAppointment, useCompleteAppointment, useRescheduleAppointment } from './queries';

interface ActionDialogProps {
  appointment: AppointmentDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ───────────────────────────── reprogramar ─────────────────────────────

export const RescheduleFormSchema = z
  .object({
    scheduledAt: z.string().min(1, 'Indica la nueva fecha y hora.'),
    location: z.string().trim().max(300, 'Máximo 300 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.scheduledAt && new Date(managuaLocalToIso(v.scheduledAt)).getTime() <= Date.now()) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduledAt'],
        message: 'La nueva fecha debe ser futura.',
      });
    }
  });
type RescheduleValues = z.infer<typeof RescheduleFormSchema>;

export function RescheduleAppointmentDialog({
  appointment,
  open,
  onOpenChange,
}: ActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <RescheduleForm appointment={appointment} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  appointment,
  onClose,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
}) {
  const uid = useId();
  const mutation = useRescheduleAppointment();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RescheduleValues>({
    resolver: zodResolver(RescheduleFormSchema),
    defaultValues: { scheduledAt: '', location: appointment.location ?? '' },
  });
  const next = watch('scheduledAt');
  const nextValid = next && !Number.isNaN(new Date(managuaLocalToIso(next)).getTime());

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await mutation.mutateAsync({
        id: appointment.id,
        scheduledAt: managuaLocalToIso(values.scheduledAt),
        location: values.location || undefined,
      });
      toast.success(
        `Cita reprogramada: ${formatAbsolute(res.previous.scheduledAt)} → ${formatAbsolute(res.appointment.scheduledAt)}`,
      );
      onClose();
    } catch (err) {
      toast.error(appointmentErrorMessage(err));
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Reprogramar cita</DialogTitle>
        <DialogDescription>
          {appointment.companyName ?? `Empresa ${appointment.companyId}`}. La cita original queda
          como reprogramada y se crea una nueva.
        </DialogDescription>
      </DialogHeader>
      <div
        className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-sm tabular-nums"
        data-testid="reschedule-preview"
      >
        <span className="text-muted-foreground line-through">
          {formatAbsolute(appointment.scheduledAt)}
        </span>
        <ArrowRight className="size-4 text-primary" aria-hidden="true" />
        <span className="font-semibold">
          {nextValid ? formatAbsolute(managuaLocalToIso(next)) : 'Nueva fecha pendiente'}
        </span>
      </div>
      <FormField
        id={`${uid}-at`}
        label="Nueva fecha y hora (Managua)"
        error={errors.scheduledAt?.message}
      >
        <Input
          id={`${uid}-at`}
          type="datetime-local"
          aria-invalid={errors.scheduledAt ? true : undefined}
          {...register('scheduledAt')}
        />
      </FormField>
      <FormField id={`${uid}-loc`} label="Lugar" error={errors.location?.message}>
        <Input id={`${uid}-loc`} maxLength={300} {...register('location')} />
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Reprogramando…' : 'Reprogramar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── completar ─────────────────────────────

const CompleteSchema = z.object({
  outcome: z
    .string()
    .trim()
    .min(1, 'Indica el resultado de la reunión.')
    .max(1500, 'Máximo 1500 caracteres.'),
});

export function CompleteAppointmentDialog({ appointment, open, onOpenChange }: ActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <CompleteForm appointment={appointment} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CompleteForm({
  appointment,
  onClose,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
}) {
  const uid = useId();
  const mutation = useCompleteAppointment();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof CompleteSchema>>({
    resolver: zodResolver(CompleteSchema),
    defaultValues: { outcome: '' },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({ id: appointment.id, outcome: values.outcome });
      toast.success('Cita marcada como realizada.');
      onClose();
    } catch (err) {
      toast.error(appointmentErrorMessage(err));
    }
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Completar cita</DialogTitle>
        <DialogDescription>
          {appointment.companyName ?? `Empresa ${appointment.companyId}`} ·{' '}
          {formatAbsolute(appointment.scheduledAt)}
        </DialogDescription>
      </DialogHeader>
      <FormField
        id={`${uid}-outcome`}
        label="Resultado de la reunión"
        error={errors.outcome?.message}
      >
        <Textarea
          id={`${uid}-outcome`}
          maxLength={1500}
          placeholder="¿Qué se acordó? ¿Próximos pasos?"
          aria-invalid={errors.outcome ? true : undefined}
          {...register('outcome')}
        />
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Volver
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Marcar como realizada'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── cancelar ─────────────────────────────

const CancelSchema = z.object({ reason: z.string().trim().max(1000, 'Máximo 1000 caracteres.') });

export function CancelAppointmentDialog({ appointment, open, onOpenChange }: ActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <CancelForm appointment={appointment} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CancelForm({
  appointment,
  onClose,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
}) {
  const uid = useId();
  const mutation = useCancelAppointment();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof CancelSchema>>({
    resolver: zodResolver(CancelSchema),
    defaultValues: { reason: '' },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({ id: appointment.id, reason: values.reason || undefined });
      toast.success('Cita cancelada. El estado de la empresa no cambia automáticamente.');
      onClose();
    } catch (err) {
      toast.error(appointmentErrorMessage(err));
    }
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Cancelar cita</DialogTitle>
        <DialogDescription>
          ¿Cancelar la cita con {appointment.companyName ?? `la empresa ${appointment.companyId}`}{' '}
          del {formatAbsolute(appointment.scheduledAt)}? Esta acción no se puede deshacer; si hace
          falta podrás agendar otra. La empresa conserva su estado actual en el pipeline.
        </DialogDescription>
      </DialogHeader>
      <FormField id={`${uid}-reason`} label="Motivo (opcional)" error={errors.reason?.message}>
        <Textarea id={`${uid}-reason`} maxLength={1000} {...register('reason')} />
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Volver
        </Button>
        <Button type="submit" variant="destructive" disabled={mutation.isPending}>
          {mutation.isPending ? 'Cancelando…' : 'Cancelar cita'}
        </Button>
      </DialogFooter>
    </form>
  );
}
