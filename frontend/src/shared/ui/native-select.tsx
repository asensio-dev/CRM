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
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
