import { Meter } from '@/shared/ui/meter';

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

/** Barra de progreso accesible (role="progressbar"); envuelve el `Meter` compartido. */
export function ProgressBar(props: ProgressBarProps) {
  return <Meter {...props} />;
}
