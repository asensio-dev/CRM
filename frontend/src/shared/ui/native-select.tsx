import type { Ref, SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

/** `<select>` nativo con el estilo de `Input` (accesible y usable en móvil). */
export function NativeSelect({ className, ref, ...props }: NativeSelectProps) {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs transition-[border-color,box-shadow] hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
