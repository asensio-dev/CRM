import {
  type AssignmentChangeResultDto,
  type AssignmentDto,
  type ExecutiveCoverageDto,
  RELEASE_REASONS,
  type ReleaseReason,
} from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useActivities, useSectors } from '@/features/pipeline/api';
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
import { useBulkAssign, useReassign, useReleaseAssignment } from './api';

export const RELEASE_REASON_LABELS: Record<ReleaseReason, string> = {
  SIN_AVANCE: 'Sin avance',
  REASIGNACION_MANUAL: 'Reasignación manual',
  CONTRATO_ACTIVO: 'Contrato activo',
  DESCARTADO: 'Descartada',
};

const fieldError = (m?: string) =>
  m ? (
    <p role="alert" className="text-sm text-destructive">
      {m}
    </p>
  ) : null;

/** Resumen de una reasignación / asignación masiva / liberación. */
export function ChangeResultSummary({
  result,
  names,
}: {
  result: AssignmentChangeResultDto;
  /** Nombres de empresa por id, para listar las omitidas. */
  names?: ReadonlyMap<number, string>;
}) {
  return (
    <div className="grid gap-2 text-sm" data-testid="change-result">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border bg-emerald-500/10 p-2">
          <dt className="text-xs text-muted-foreground">Asignadas</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="result-assigned">
            {result.assigned.length}
          </dd>
        </div>
        <div className="rounded-md border bg-sky-500/10 p-2">
          <dt className="text-xs text-muted-foreground">Liberadas</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="result-released">
            {result.released.length}
          </dd>
        </div>
        <div className="rounded-md border bg-amber-500/10 p-2">
          <dt className="text-xs text-muted-foreground">Omitidas</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="result-skipped">
            {result.skipped.length}
          </dd>
        </div>
      </dl>
      {result.skipped.length > 0 && (
        <div>
          <p className="text-muted-foreground">
            Omitidas (ya eran del destino, no existen o están fuera de rotación):
          </p>
          <ul className="mt-1 max-h-28 list-inside list-disc overflow-auto">
            {result.skipped.map((id) => (
              <li key={id}>{names?.get(id) ?? `Empresa ${id}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ResultView({
  title,
  result,
  names,
  onClose,
}: {
  title: string;
  result: AssignmentChangeResultDto;
  names?: ReadonlyMap<number, string>;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
          {title}
        </DialogTitle>
        <DialogDescription>Resumen de los cambios aplicados.</DialogDescription>
      </DialogHeader>
      <ChangeResultSummary result={result} names={names} />
      <DialogFooter>
        <Button onClick={onClose}>Listo</Button>
      </DialogFooter>
    </div>
  );
}

// ───────────────────────────── Reasignar ─────────────────────────────

export interface SelectedCompany {
  id: number;
  name: string;
}

export function ReassignDialog({
  open,
  onOpenChange,
  selection,
  executives,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: readonly SelectedCompany[];
  executives: readonly ExecutiveCoverageDto[];
  /** Tras una reasignación aplicada (para limpiar la selección). */
  onDone?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ReassignForm
          selection={selection}
          executives={executives}
          onDone={onDone}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReassignForm({
  selection,
  executives,
  onDone,
  onClose,
}: {
  selection: readonly SelectedCompany[];
  executives: readonly ExecutiveCoverageDto[];
  onDone?: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [toUserId, setToUserId] = useState('');
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<AssignmentChangeResultDto | null>(null);
  const mutation = useReassign();
  const names = new Map(selection.map((s) => [s.id, s.name]));

  if (result) {
    return (
      <ResultView title="Reasignación aplicada" result={result} names={names} onClose={onClose} />
    );
  }

  const submit = () => {
    setTouched(true);
    if (!toUserId) return;
    mutation.mutate(
      { companyIds: selection.map((s) => s.id), toUserId: Number(toUserId) },
      {
        onSuccess: (res) => {
          setResult(res);
          onDone?.();
          toast.success(`Reasignación aplicada: ${res.assigned.length} empresas.`);
        },
      },
    );
  };

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Reasignar empresas</DialogTitle>
        <DialogDescription>
          {selection.length === 1
            ? `Se moverá "${selection[0]?.name}" a otro ejecutivo.`
            : `Se moverán ${selection.length} empresas a otro ejecutivo.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-to`}>Ejecutivo destino</Label>
        <NativeSelect
          id={`${uid}-to`}
          value={toUserId}
          aria-invalid={touched && !toUserId ? true : undefined}
          onChange={(e) => setToUserId(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {executives.map((e) => (
            <option key={e.userId} value={e.userId}>
              {e.fullName} ({e.assigned}/{e.target})
            </option>
          ))}
        </NativeSelect>
        {touched && !toUserId && fieldError('Selecciona el ejecutivo destino.')}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Reasignando…' : 'Reasignar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── Liberar ─────────────────────────────

export function ReleaseDialog({
  assignment,
  onOpenChange,
}: {
  /** null = cerrado. */
  assignment: AssignmentDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={assignment !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {assignment && <ReleaseForm assignment={assignment} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReleaseForm({ assignment, onClose }: { assignment: AssignmentDto; onClose: () => void }) {
  const uid = useId();
  const [reason, setReason] = useState<ReleaseReason>('REASIGNACION_MANUAL');
  const [result, setResult] = useState<AssignmentChangeResultDto | null>(null);
  const mutation = useReleaseAssignment();

  if (result) {
    return <ResultView title="Asignación liberada" result={result} onClose={onClose} />;
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(
          { id: assignment.id, reason },
          {
            onSuccess: (res) => {
              setResult(res);
              toast.success(`"${assignment.legalName}" volvió al pool.`);
            },
            // Ya estaba liberada: la lista se refresca (onSettled) y el diálogo se cierra.
            onError: (err) => {
              if ((err as { code?: string }).code === 'PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED') {
                onClose();
              }
            },
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Liberar asignación</DialogTitle>
        <DialogDescription>
          "{assignment.legalName}" saldrá de la cartera de {assignment.userName} y volverá al pool.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-reason`}>Motivo</Label>
        <NativeSelect
          id={`${uid}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value as ReleaseReason)}
        >
          {RELEASE_REASONS.map((r) => (
            <option key={r} value={r}>
              {RELEASE_REASON_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" variant="destructive" disabled={mutation.isPending}>
          {mutation.isPending ? 'Liberando…' : 'Liberar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── Asignación masiva ─────────────────────────────

const intString = (min: number, max: number | undefined, message: string) =>
  z.string().refine((v) => {
    if (!/^\d+$/.test(v)) return false;
    const n = Number(v);
    return n >= min && (max === undefined || n <= max);
  }, message);

export const BulkFormSchema = z.object({
  toUserId: z.string().min(1, 'Selecciona el ejecutivo destino.'),
  limit: intString(1, 500, 'Indica una cantidad entre 1 y 500.'),
  sectorId: z.string(),
  activityId: z.string(),
  minEmployees: z
    .string()
    .refine((v) => v === '' || /^\d+$/.test(v), 'Indica un número entero (0 o más).'),
});
export type BulkFormValues = z.infer<typeof BulkFormSchema>;

export function BulkAssignDialog({
  open,
  onOpenChange,
  executives,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executives: readonly ExecutiveCoverageDto[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <BulkForm executives={executives} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BulkForm({
  executives,
  onClose,
}: {
  executives: readonly ExecutiveCoverageDto[];
  onClose: () => void;
}) {
  const uid = useId();
  const sectors = useSectors();
  const activities = useActivities();
  const mutation = useBulkAssign();
  const [result, setResult] = useState<AssignmentChangeResultDto | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BulkFormValues>({
    resolver: zodResolver(BulkFormSchema),
    defaultValues: { toUserId: '', limit: '20', sectorId: '', activityId: '', minEmployees: '' },
  });

  if (result) {
    return <ResultView title="Asignación masiva aplicada" result={result} onClose={onClose} />;
  }

  const onSubmit = handleSubmit((v) =>
    mutation.mutate(
      {
        toUserId: Number(v.toUserId),
        limit: Number(v.limit),
        filters: {
          sectorId: v.sectorId ? Number(v.sectorId) : undefined,
          activityId: v.activityId ? Number(v.activityId) : undefined,
          minEmployees: v.minEmployees ? Number(v.minEmployees) : undefined,
        },
      },
      {
        onSuccess: (res) => {
          setResult(res);
          toast.success(`Asignación masiva: ${res.assigned.length} empresas asignadas.`);
        },
      },
    ),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Asignación masiva</DialogTitle>
        <DialogDescription>
          Toma empresas del pool (sin asignar, con teléfono) que cumplan los filtros, empezando por
          las de más empleados.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-to`}>Ejecutivo destino</Label>
        <NativeSelect
          id={`${uid}-to`}
          aria-invalid={errors.toUserId ? true : undefined}
          {...register('toUserId')}
        >
          <option value="">Selecciona…</option>
          {executives.map((e) => (
            <option key={e.userId} value={e.userId}>
              {e.fullName} ({e.assigned}/{e.target})
            </option>
          ))}
        </NativeSelect>
        {fieldError(errors.toUserId?.message)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-sector`}>Sector (opcional)</Label>
          <NativeSelect id={`${uid}-sector`} {...register('sectorId')}>
            <option value="">Todos</option>
            {sectors.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-activity`}>Actividad (opcional)</Label>
          <NativeSelect id={`${uid}-activity`} {...register('activityId')}>
            <option value="">Todas</option>
            {activities.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-min`}>Mínimo de empleados</Label>
          <Input
            id={`${uid}-min`}
            inputMode="numeric"
            placeholder="Sin mínimo"
            aria-invalid={errors.minEmployees ? true : undefined}
            {...register('minEmployees')}
          />
          {fieldError(errors.minEmployees?.message)}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-limit`}>Cantidad máxima</Label>
          <Input
            id={`${uid}-limit`}
            inputMode="numeric"
            aria-invalid={errors.limit ? true : undefined}
            {...register('limit')}
          />
          {fieldError(errors.limit?.message)}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Asignando…' : 'Asignar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
