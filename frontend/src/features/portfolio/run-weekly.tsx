import type { RunWeeklyResultDto } from '@axiom/contracts';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/modal-dialog';
import { useRunWeekly } from './api';

export function RunWeeklySummary({ result }: { result: RunWeeklyResultDto }) {
  return (
    <ul className="grid gap-1.5 text-sm" data-testid="run-weekly-result">
      {result.closedCycle && (
        <li>
          Ciclo #{result.closedCycle.number} cerrado: {result.closedCycle.evaluated} evaluadas,{' '}
          {result.closedCycle.withProgress} con avance, {result.closedCycle.withoutProgress} sin
          avance, {result.closedCycle.released} liberadas al pool.
        </li>
      )}
      {result.openedCycle !== null && <li>Ciclo #{result.openedCycle} abierto.</li>}
      <li>
        Reposición de carteras: {result.refill.assigned} empresas asignadas a{' '}
        {result.refill.executives} ejecutivos
        {result.refill.shortfall > 0 ? ` (faltaron ${result.refill.shortfall})` : ''}.
      </li>
      <li>
        Planes semanales: {result.plans.generated} generados, {result.plans.existing} ya existían (
        {result.plans.items} ítems).
      </li>
    </ul>
  );
}

/**
 * Diálogo controlado de "Ejecutar rotación semanal" (confirmación + resumen del resultado).
 * Móntalo en un sitio ESTABLE de la página: si vive dentro de un estado vacío que desaparece al
 * refrescarse los datos tras la rotación, el resumen y el toast se pierden.
 */
export function RunWeeklyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<RunWeeklyResultDto | null>(null);
  const mutation = useRunWeekly();

  const change = (o: boolean) => {
    onOpenChange(o);
    if (!o) setResult(null);
  };

  const run = () =>
    mutation.mutate(undefined, {
      onSuccess: (res) => {
        setResult(res);
        toast.success(
          `Rotación ejecutada: ${res.plans.generated} planes generados, ${res.refill.assigned} empresas asignadas.`,
        );
      },
    });

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        {result ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
                Rotación ejecutada
              </DialogTitle>
              <DialogDescription>
                Semana {result.week.weekNumber} de {result.week.totalWeeks} · Ciclo #
                {result.week.cycle.number}
              </DialogDescription>
            </DialogHeader>
            <RunWeeklySummary result={result} />
            <DialogFooter>
              <Button onClick={() => change(false)}>Listo</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>¿Ejecutar la rotación semanal?</DialogTitle>
              <DialogDescription>
                Cierra el ciclo si ya terminó, repone las carteras desde el pool y genera los planes
                de la semana. Es seguro repetirla: no duplica planes ya generados.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => change(false)}>
                Cancelar
              </Button>
              <Button onClick={run} disabled={mutation.isPending}>
                {mutation.isPending ? 'Ejecutando…' : 'Ejecutar ahora'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Botón ADMIN "Ejecutar rotación semanal" con su diálogo (para ubicaciones estables, p. ej. cabeceras). */
export function RunWeeklyButton({
  variant = 'outline',
  size,
  label = 'Ejecutar rotación semanal',
  onClick,
}: {
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  label?: string;
  /** Si se pasa, el botón solo dispara `onClick` (el diálogo lo monta el padre con RunWeeklyDialog). */
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={onClick ?? (() => setOpen(true))}>
        <RefreshCw aria-hidden="true" />
        {label}
      </Button>
      {!onClick && <RunWeeklyDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
