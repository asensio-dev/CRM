import {
  PIPELINE_STATUSES_REQUIRING_NOTE,
  type PipelineStateDto,
  type PipelineStatus,
} from '@axiom/contracts';
import { ArrowRightLeft } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Button, type ButtonProps } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useChangeStatus, usePipelineState } from './api';
import { StatusNoteDialog } from './status-note-dialog';

export interface ChangeStatusMenuProps {
  companyId: number;
  /** Para el título del diálogo de nota. */
  companyName?: string;
  /**
   * Estado ya conocido (p. ej. el de la ficha). Si se omite, el menú lo consulta al abrirse
   * (`GET /api/pipeline/companies/:id`) para listar solo `allowedNextStatuses`.
   */
  state?: PipelineStateDto;
  /** Texto del botón por defecto y del encabezado del menú. Por defecto "Cambiar estado". */
  label?: string;
  /** Disparador propio (se renderiza con `asChild`); reemplaza al botón por defecto. */
  trigger?: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  /** Se invoca tras un cambio exitoso con el estado nuevo. */
  onChanged?: (state: PipelineStateDto) => void;
}

/**
 * Menú "Cambiar estado": lista únicamente los destinos que el backend permite al usuario y
 * pide una nota cuando el destino la exige. Usa `expectedVersion` para evitar pisar cambios
 * ajenos (409 → se refresca y se avisa con un toast).
 */
export function ChangeStatusMenu({
  companyId,
  companyName,
  state: knownState,
  label = 'Cambiar estado',
  trigger,
  variant = 'outline',
  size = 'sm',
  className,
  onChanged,
}: ChangeStatusMenuProps) {
  const [open, setOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<PipelineStatus | null>(null);
  const fetched = usePipelineState(companyId, { enabled: open && !knownState });
  const state = knownState ?? fetched.data;
  const mutation = useChangeStatus();

  function apply(to: PipelineStatus, note?: string) {
    mutation.mutate(
      { companyId, to, note, expectedVersion: state?.version },
      {
        onSuccess: (next) => {
          setNoteFor(null);
          onChanged?.(next);
        },
        onError: () => setNoteFor(null),
      },
    );
  }

  function select(to: PipelineStatus) {
    if (PIPELINE_STATUSES_REQUIRING_NOTE.includes(to)) setNoteFor(to);
    else apply(to);
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button
              variant={variant}
              size={size}
              className={className}
              disabled={mutation.isPending}
            >
              <ArrowRightLeft aria-hidden="true" />
              {label}
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
          {!state && !fetched.isError && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground" role="status">
              Cargando…
            </p>
          )}
          {fetched.isError && !state && (
            <p className="px-2 py-1.5 text-sm text-destructive" role="alert">
              No se pudieron cargar los estados.
            </p>
          )}
          {state && state.allowedNextStatuses.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No hay cambios de estado disponibles.
            </p>
          )}
          {state?.allowedNextStatuses.map((status) => (
            <DropdownMenuItem key={status} onSelect={() => select(status)}>
              <span
                aria-hidden="true"
                className={cn('size-2 rounded-full', PIPELINE_STATUS_STYLES[status].dot)}
              />
              {PIPELINE_STATUS_STYLES[status].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {noteFor && (
        <StatusNoteDialog
          open
          onOpenChange={(o) => !o && setNoteFor(null)}
          status={noteFor}
          companyName={companyName}
          pending={mutation.isPending}
          onConfirm={(note) => apply(noteFor, note)}
        />
      )}
    </>
  );
}
