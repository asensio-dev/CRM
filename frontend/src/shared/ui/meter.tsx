import { cn } from '../lib/cn';

interface MeterProps {
  value: number;
  max: number;
  label: string;
  /** Texto accesible del valor cuando supera la meta o no es un simple número (p. ej. "112,5 %"). */
  valueText?: string;
  /** `sm` 6px, `md` 8px (por defecto), `lg` 12px para el avance principal. */
  size?: 'sm' | 'md' | 'lg';
  /** Verde cuando se alcanzó la meta. */
  complete?: boolean;
  className?: string;
}

/**
 * Barra de avance con "pista fantasma": la pista pálida ocupa todo el ancho y el relleno azul
 * se desvanece hacia su origen. Firma visual del sistema (cuota, cobertura, ciclo).
 */
export function Meter({
  value,
  max,
  label,
  valueText,
  size = 'md',
  complete,
  className,
}: MeterProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-track',
        size === 'lg' ? 'h-3' : size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          complete ? 'bg-success' : 'bg-fill-fade',
        )}
        style={{ width: `${pct}%`, minWidth: value > 0 ? '0.375rem' : undefined }}
      />
    </div>
  );
}
