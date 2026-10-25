import { CONTRACT_STATUS_LABELS, type ContractStatus } from '@axiom/contracts';
import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { formatAbsolute } from '@/shared/lib/format-date';
import { formatDayMonthYear } from '@/shared/lib/managua-time';
import { formatMoney } from '@/shared/lib/money';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/modal-dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { EditContractDialog } from './contract-form-dialog';
import { contractErrorMessage } from './errors';
import {
  canEditContract,
  nextStatusActions,
  STATUS_ACTION_LABELS,
  STATUS_BADGE,
  STATUS_SIDE_EFFECTS,
  STATUS_SUCCESS,
} from './logic';
import { useChangeContractStatus, useContract } from './queries';

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE[status]} data-status={status}>
      {CONTRACT_STATUS_LABELS[status]}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function ContractDetailDialog({
  contractId,
  onClose,
}: {
  contractId: number | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={contractId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {contractId !== null && <DetailBody contractId={contractId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ contractId, onClose }: { contractId: number; onClose: () => void }) {
  const query = useContract(contractId);
  const change = useChangeContractStatus();
  const [pendingTo, setPendingTo] = useState<ContractStatus | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const c = query.data;

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="Cargando contrato" className="space-y-3">
        <DialogTitle className="sr-only">Cargando contrato</DialogTitle>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (query.isError || !c) {
    return (
      <div role="alert" className="space-y-3">
        <DialogTitle>No se pudo cargar el contrato</DialogTitle>
        <DialogDescription>{contractErrorMessage(query.error)}</DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => query.refetch()}>Reintentar</Button>
        </DialogFooter>
      </div>
    );
  }

  const actions = nextStatusActions(c.status);

  const confirm = async () => {
    if (!pendingTo) return;
    try {
      await change.mutateAsync({ id: c.id, to: pendingTo });
      toast.success(STATUS_SUCCESS[pendingTo] ?? 'Estado actualizado.');
    } catch (err) {
      toast.error(contractErrorMessage(err));
    } finally {
      setPendingTo(null);
    }
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {c.code}
          <ContractStatusBadge status={c.status} />
        </DialogTitle>
        <DialogDescription>
          <Link
            to="/empresas/$companyId"
            params={{ companyId: c.companyId }}
            className="font-medium text-foreground hover:underline"
            onClick={onClose}
          >
            {c.companyName ?? `Empresa ${c.companyId}`}
          </Link>
        </DialogDescription>
      </DialogHeader>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Monto">
          <span className="font-semibold tabular-nums">{formatMoney(c.amount, c.currency)}</span>
        </Field>
        <Field label="Vigencia">
          {formatDayMonthYear(c.startDate)} →{' '}
          {c.endDate ? formatDayMonthYear(c.endDate) : 'Sin fecha de fin'}
        </Field>
        <Field label="Creado">{formatAbsolute(c.createdAt)}</Field>
        <Field label="Actualizado">{formatAbsolute(c.updatedAt)}</Field>
        {c.notes && (
          <div className="sm:col-span-2">
            <Field label="Notas">
              <span className="whitespace-pre-line">{c.notes}</span>
            </Field>
          </div>
        )}
      </dl>

      {pendingTo ? (
        <div
          role="alertdialog"
          aria-label="Confirmar cambio de estado"
          className="space-y-3 rounded-md border bg-muted/50 p-3"
        >
          <p className="text-sm font-medium">
            {STATUS_ACTION_LABELS[pendingTo]}: {CONTRACT_STATUS_LABELS[c.status]} →{' '}
            {CONTRACT_STATUS_LABELS[pendingTo]}
          </p>
          <p className="text-sm text-muted-foreground">{STATUS_SIDE_EFFECTS[pendingTo]}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingTo(null)}
              disabled={change.isPending}
            >
              Volver
            </Button>
            <Button
              variant={pendingTo === 'CANCELADO' ? 'destructive' : 'default'}
              onClick={confirm}
              disabled={change.isPending}
            >
              {change.isPending ? 'Aplicando…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      ) : (
        <DialogFooter className="sm:justify-between">
          <div>
            {canEditContract(c.status) && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" />
                Editar
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {actions.map((to) => (
              <Button
                key={to}
                variant={to === 'CANCELADO' ? 'outline' : 'default'}
                className={to === 'CANCELADO' ? 'text-destructive' : undefined}
                onClick={() => setPendingTo(to)}
              >
                {STATUS_ACTION_LABELS[to]}
              </Button>
            ))}
            {actions.length === 0 && (
              <p className="self-center text-sm text-muted-foreground">
                Estado final: no hay acciones disponibles.
              </p>
            )}
          </div>
        </DialogFooter>
      )}
      <EditContractDialog contract={c} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
