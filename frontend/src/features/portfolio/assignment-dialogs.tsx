import {
  type AssignmentChangeResultDto,
  type AssignmentDto,
  type ExecutiveCoverageDto,
  RELEASE_REASONS,
  type ReleaseReason,
} from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useActivities, useSectors } from '@/features/pipeline/api';
import { useClientList } from '@/shared/hooks/use-client-list';
import { Button } from '@/shared/ui/button';
import type { ComboboxOption } from '@/shared/ui/combobox';
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
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/ui/pagination';
import { SearchInput } from '@/shared/ui/search-input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
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

/** Opciones de ejecutivo con su ocupación de cartera (se busca por nombre). */
function executiveOptions(executives: readonly ExecutiveCoverageDto[]): ComboboxOption[] {
  return executives.map((e) => ({
    id: e.userId,
    name: `${e.fullName} (${e.assigned}/${e.target})`,
  }));
}

const findOption = (options: readonly ComboboxOption[], id: string) =>
  id ? (options.find((o) => String(o.id) === id) ?? null) : null;

const LIST_PAGE_SIZE = DEFAULT_PAGE_SIZE;
const nameText = (c: SelectedCompany) => c.name;

/** Lista compacta de empresas con búsqueda (si son muchas) y paginación en cliente. */
export function CompanyNameList({
  companies,
  label,
}: {
  companies: readonly SelectedCompany[];
  label: string;
}) {
  const list = useClientList(companies, { searchText: nameText, pageSize: LIST_PAGE_SIZE });
  const many = companies.length > LIST_PAGE_SIZE;
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/40 p-2">
      {many && (
        <SearchInput
          value={list.query}
          onValueChange={list.setQuery}
          placeholder="Buscar empresa…"
          aria-label={`Buscar en ${label.toLowerCase()}`}
          inputClassName="h-8"
        />
      )}
      {list.total === 0 ? (
        <p className="px-1 py-1.5 text-sm text-muted-foreground">Sin resultados</p>
      ) : (
        <ul aria-label={label} className="grid gap-0.5 text-sm">
          {list.pageItems.map((c) => (
            <li key={c.id} className="truncate rounded-md px-1.5 py-1">
              {c.name}
            </li>
          ))}
        </ul>
      )}
      {list.total > LIST_PAGE_SIZE && (
        <Pagination
          variant="compact"
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
          className="border-t px-1 pt-2"
        />
      )}
    </div>
  );
}

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
        <div className="rounded-lg border bg-success/8 p-2">
          <dt className="text-xs text-muted-foreground">Asignadas</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="result-assigned">
            {result.assigned.length}
          </dd>
        </div>
        <div className="rounded-lg border bg-accent p-2">
          <dt className="text-xs text-muted-foreground">Liberadas</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="result-released">
            {result.released.length}
          </dd>
        </div>
        <div className="rounded-lg border bg-warning/8 p-2">
          <dt className="text-xs text-muted-foreground">Omitidas</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="result-skipped">
            {result.skipped.length}
          </dd>
        </div>
      </dl>
      {result.skipped.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-muted-foreground">
            Omitidas (ya eran del destino, no existen o están fuera de rotación):
          </p>
          <CompanyNameList
            label="Empresas omitidas"
            companies={result.skipped.map((id) => ({
              id,
              name: names?.get(id) ?? `Empresa ${id}`,
            }))}
          />
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
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
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
  const options = useMemo(() => executiveOptions(executives), [executives]);

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
      {selection.length > 1 && (
        <CompanyNameList label="Empresas seleccionadas" companies={selection} />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-to`}>Ejecutivo destino</Label>
        <SearchableSelect
          id={`${uid}-to`}
          placeholder="Selecciona…"
          searchPlaceholder="Buscar ejecutivo…"
          emptyText="Ningún ejecutivo coincide"
          options={options}
          value={findOption(options, toUserId)}
          invalid={touched && !toUserId}
          onChange={(o) => setToUserId(o ? String(o.id) : '')}
        />
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
  const execOptions = useMemo(() => executiveOptions(executives), [executives]);
  const sectorOptions = useMemo<ComboboxOption[]>(() => sectors.data ?? [], [sectors.data]);
  const activityOptions = useMemo<ComboboxOption[]>(() => activities.data ?? [], [activities.data]);
  const {
    control,
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
        <Controller
          control={control}
          name="toUserId"
          render={({ field }) => (
            <SearchableSelect
              id={`${uid}-to`}
              placeholder="Selecciona…"
              searchPlaceholder="Buscar ejecutivo…"
              emptyText="Ningún ejecutivo coincide"
              options={execOptions}
              value={findOption(execOptions, field.value)}
              invalid={!!errors.toUserId}
              onChange={(o) => field.onChange(o ? String(o.id) : '')}
            />
          )}
        />
        {fieldError(errors.toUserId?.message)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-sector`}>Sector (opcional)</Label>
          <Controller
            control={control}
            name="sectorId"
            render={({ field }) => (
              <SearchableSelect
                id={`${uid}-sector`}
                placeholder="Todos"
                searchPlaceholder="Buscar sector…"
                options={sectorOptions}
                isLoading={sectors.isPending}
                value={findOption(sectorOptions, field.value)}
                onChange={(o) => field.onChange(o ? String(o.id) : '')}
              />
            )}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-activity`}>Actividad (opcional)</Label>
          <Controller
            control={control}
            name="activityId"
            render={({ field }) => (
              <SearchableSelect
                id={`${uid}-activity`}
                placeholder="Todas"
                searchPlaceholder="Buscar actividad…"
                options={activityOptions}
                isLoading={activities.isPending}
                value={findOption(activityOptions, field.value)}
                onChange={(o) => field.onChange(o ? String(o.id) : '')}
              />
            )}
          />
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
