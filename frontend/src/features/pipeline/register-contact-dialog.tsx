import {
  INTERACTION_CHANNELS,
  INTERACTION_OUTCOMES,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUSES,
  PIPELINE_STATUSES_REQUIRING_NOTE,
  type PipelineStatus,
  type RegisterInteractionRequest,
  type RegisterInteractionResultDto,
} from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { localInputToIso } from '@/shared/lib/format-date';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/modal-dialog';
import { NativeSelect } from '@/shared/ui/native-select';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Textarea } from '@/shared/ui/text-area';
import { usePipelineState, useRegisterInteraction } from './api';
import { isConcurrencyError, pipelineErrorMessage } from './errors';
import { CHANNEL_LABELS, OUTCOME_LABELS } from './labels';

export const ContactFormSchema = z
  .object({
    channel: z.enum(INTERACTION_CHANNELS, { error: 'Selecciona el canal.' }),
    outcome: z.enum(INTERACTION_OUTCOMES, { error: 'Selecciona el resultado.' }),
    notes: z.string().trim().max(2000, 'Máximo 2000 caracteres.'),
    nextFollowUpAt: z.string(),
    targetStatus: z.union([z.enum(PIPELINE_STATUSES), z.literal('')]),
    statusNote: z.string().trim().max(1000, 'Máximo 1000 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.nextFollowUpAt && Number.isNaN(new Date(v.nextFollowUpAt).getTime())) {
      ctx.addIssue({ code: 'custom', path: ['nextFollowUpAt'], message: 'Fecha no válida.' });
    }
    if (
      v.targetStatus &&
      PIPELINE_STATUSES_REQUIRING_NOTE.includes(v.targetStatus) &&
      !v.statusNote &&
      !v.notes
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['statusNote'],
        message: 'Indica el motivo del cambio de estado.',
      });
    }
  });
export type ContactFormValues = z.infer<typeof ContactFormSchema>;

/** Convierte los valores del formulario en el cuerpo de `POST …/interactions`. */
export function toInteractionRequest(
  v: ContactFormValues,
  extra: { planItemId?: number; expectedVersion?: number } = {},
): RegisterInteractionRequest {
  return {
    channel: v.channel,
    outcome: v.outcome,
    notes: v.notes || undefined,
    nextFollowUpAt: v.nextFollowUpAt ? localInputToIso(v.nextFollowUpAt) : undefined,
    targetStatus: v.targetStatus || undefined,
    statusNote: v.targetStatus && v.statusNote ? v.statusNote : undefined,
    planItemId: extra.planItemId,
    expectedVersion: extra.expectedVersion,
  };
}

export interface RegisterContactDialogProps {
  companyId: number;
  companyName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ítem del plan semanal ("Mi semana") que se está gestionando; el backend lo guarda en la interacción. */
  planItemId?: number;
  /** Se invoca al registrar con éxito, con el estado nuevo y las transiciones aplicadas. */
  onRegistered?: (result: RegisterInteractionResultDto) => void;
}

/**
 * Diálogo "Registrar contacto": canal, resultado, notas, próximo seguimiento y estado destino
 * opcional. Al terminar muestra las transiciones que aplicó el backend.
 */
export function RegisterContactDialog({
  companyId,
  companyName,
  open,
  onOpenChange,
  planItemId,
  onRegistered,
}: RegisterContactDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ContactForm
          companyId={companyId}
          companyName={companyName}
          planItemId={planItemId}
          onRegistered={onRegistered}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  companyId,
  companyName,
  planItemId,
  onRegistered,
  onClose,
}: {
  companyId: number;
  companyName?: string;
  planItemId?: number;
  onRegistered?: (r: RegisterInteractionResultDto) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const state = usePipelineState(companyId);
  const mutation = useRegisterInteraction();
  const [result, setResult] = useState<RegisterInteractionResultDto | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(ContactFormSchema),
    defaultValues: {
      channel: 'LLAMADA',
      outcome: '' as ContactFormValues['outcome'],
      notes: '',
      nextFollowUpAt: '',
      targetStatus: '',
      statusNote: '',
    },
  });
  const target = watch('targetStatus');
  const needsNote = !!target && PIPELINE_STATUSES_REQUIRING_NOTE.includes(target);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await mutation.mutateAsync({
        companyId,
        ...toInteractionRequest(values, { planItemId, expectedVersion: state.data?.version }),
      });
      setResult(res);
      onRegistered?.(res);
    } catch (err) {
      toast.error(pipelineErrorMessage(err));
      if (isConcurrencyError(err)) void state.refetch();
    }
  });

  if (result) {
    return (
      <div className="grid gap-4" data-testid="contact-result">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            Contacto registrado
          </DialogTitle>
          <DialogDescription>{companyName ?? 'La empresa'} quedó actualizada.</DialogDescription>
        </DialogHeader>
        <TransitionsSummary result={result} />
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </div>
    );
  }

  const err = (m?: string) =>
    m ? (
      <p role="alert" className="text-sm text-destructive">
        {m}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Registrar contacto</DialogTitle>
        <DialogDescription>
          {companyName ? `${companyName}. ` : ''}El estado puede cambiar automáticamente según el
          resultado.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-channel`}>Canal</Label>
          <NativeSelect
            id={`${uid}-channel`}
            aria-invalid={errors.channel ? true : undefined}
            {...register('channel')}
          >
            {INTERACTION_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
          {err(errors.channel?.message)}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-outcome`}>Resultado</Label>
          <NativeSelect
            id={`${uid}-outcome`}
            aria-invalid={errors.outcome ? true : undefined}
            {...register('outcome')}
          >
            <option value="">Selecciona…</option>
            {INTERACTION_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </NativeSelect>
          {err(errors.outcome?.message)}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-notes`}>Notas</Label>
        <Textarea
          id={`${uid}-notes`}
          maxLength={2000}
          placeholder="¿Qué se habló?"
          {...register('notes')}
        />
        {err(errors.notes?.message)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-follow`}>Próximo seguimiento</Label>
          <Input id={`${uid}-follow`} type="datetime-local" {...register('nextFollowUpAt')} />
          {err(errors.nextFollowUpAt?.message)}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-target`}>Mover a (opcional)</Label>
          <NativeSelect id={`${uid}-target`} {...register('targetStatus')}>
            <option value="">Solo cambios automáticos</option>
            {PIPELINE_STATUSES.map((s: PipelineStatus) => (
              <option key={s} value={s}>
                {PIPELINE_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {target && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-snote`}>
            Nota del cambio de estado{needsNote ? '' : ' (opcional)'}
          </Label>
          <Textarea
            id={`${uid}-snote`}
            maxLength={1000}
            aria-invalid={errors.statusNote ? true : undefined}
            {...register('statusNote')}
          />
          {err(errors.statusNote?.message)}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Registrar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TransitionsSummary({ result }: { result: RegisterInteractionResultDto }) {
  if (result.transitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin cambio de estado. Sigue en <StatusBadge status={result.state.status} />
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Cambios de estado aplicados</p>
      <ul className="grid gap-2">
        {result.transitions.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: la lista es fija y ordenada.
          <li key={i} className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.from} />
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
            <StatusBadge status={t.to} />
          </li>
        ))}
      </ul>
    </div>
  );
}
