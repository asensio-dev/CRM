import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Nombre accesible; por defecto el placeholder. */
  'aria-label'?: string;
  /** Clases del contenedor (ancho). */
  className?: string;
  inputClassName?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Buscador con icono y botón para limpiar. Escape también limpia. */
export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Buscar…',
  className,
  inputClassName,
  ref,
  onKeyDown,
  'aria-label': ariaLabel,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onValueChange('');
          }
          onKeyDown?.(e);
        }}
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-card pl-9 pr-8 text-sm shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 [&::-webkit-search-cancel-button]:hidden',
          inputClassName,
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onValueChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
