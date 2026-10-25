import type { PipelineStatus } from '@axiom/contracts';
import { useId, useState } from 'react';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/modal-dialog';
import { Textarea } from '@/shared/ui/text-area';

export interface StatusNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Estado destino (p. ej. DESCARTADO). */
  status: PipelineStatus;
  companyName?: string;
  pending?: boolean;
  onConfirm: (note: string) => void;
}

/** Pide el motivo obligatorio de un cambio de estado (DESCARTADO). */
export function StatusNoteDialog({
  open,
  onOpenChange,
  status,
  companyName,
  pending,
  onConfirm,
}: StatusNoteDialogProps) {
  const label = PIPELINE_STATUS_STYLES[status].label;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <NoteForm
          label={label}
          companyName={companyName}
          pending={pending}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function NoteForm({
  label,
  companyName,
  pending,
  onCancel,
  onConfirm,
}: {
  label: string;
  companyName?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const id = useId();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = note.trim();
    if (!value) return setError('Escribe el motivo del cambio.');
    if (value.length > 1000) return setError('El motivo no puede superar 1000 caracteres.');
    onConfirm(value);
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Mover a "{label}"</DialogTitle>
        <DialogDescription>
          {companyName ? `${companyName}: ` : ''}este cambio requiere un motivo que quedará en el
          historial.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={id}>Motivo</Label>
        <Textarea
          id={id}
          value={note}
          maxLength={1000}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
          placeholder="Ej.: no está interesado, datos inválidos…"
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : `Mover a ${label}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
