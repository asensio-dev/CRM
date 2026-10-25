import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { cn } from '../lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface ComboboxOption {
  id: number;
  name: string;
}

interface ComboboxProps {
  id?: string;
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  options: readonly ComboboxOption[];
  /** Texto de búsqueda (controlado por el padre, que lo usa para pedir opciones al API). */
  query: string;
  onQueryChange: (q: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Selector con búsqueda asíncrona: el padre filtra las opciones según `query`. */
export function Combobox({
  id,
  value,
  onChange,
  options,
  query,
  onQueryChange,
  isLoading,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados',
  clearable = true,
  invalid,
  disabled,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia la selección activa al cambiar la lista.
  useEffect(() => setActive(0), [options]);

  const select = (option: ComboboxOption | null) => {
    onChange(option);
    setOpen(false);
    onQueryChange('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[active];
      if (option) select(option);
    }
  };

  return (
    <div className={cn('relative w-full', className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) onQueryChange('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
              clearable && value && 'pr-14',
            )}
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value?.name ?? placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0">
          <input
            // biome-ignore lint/a11y/noAutofocus: el foco debe ir al buscador al abrir el popover.
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
            className="h-9 w-full rounded-t-md border-b bg-transparent px-3 text-sm focus:outline-none"
          />
          <div id={listId} role="listbox" className="max-h-60 overflow-auto p-1">
            {isLoading && (
              <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Buscando…
              </div>
            )}
            {!isLoading && options.length === 0 && (
              <div className="px-2 py-2 text-sm text-muted-foreground">{emptyText}</div>
            )}
            {options.map((o, i) => (
              <div
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={value?.id === o.id}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => select(o)}
                onKeyDown={(e) => e.key === 'Enter' && select(o)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                <Check
                  className={cn(
                    'size-4 shrink-0',
                    value?.id === o.id ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{o.name}</span>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {clearable && value && !disabled && (
        <button
          type="button"
          aria-label="Quitar selección"
          onClick={() => onChange(null)}
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
