import { cn } from '@/shared/lib/cn';

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  /** Altura: `md` (por defecto) o `lg` para el progreso principal. */
  size?: 'md' | 'lg';
  /** Verde cuando se alcanzó la meta. */
  complete?: boolean;
  className?: string;
}

/** Barra de progreso accesible (role="progressbar"). */
export function ProgressBar({
  value,
  max,
  label,
  size = 'md',
  complete,
  className,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn(
        'w-full overflow-hidden rounded-full bg-muted',
        size === 'lg' ? 'h-4' : 'h-2',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          complete ? 'bg-emerald-500' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
