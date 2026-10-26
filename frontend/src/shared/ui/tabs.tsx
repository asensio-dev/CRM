import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';
import { cn } from '../lib/cn';

const nf = new Intl.NumberFormat('es-NI');

export interface TabItem<V extends string> {
  value: V;
  label: string;
  /** Recuento opcional junto a la etiqueta (p. ej. empresas asignadas). */
  count?: number;
}

interface TabsProps<V extends string> {
  items: readonly TabItem<V>[];
  value: V;
  onValueChange: (value: V) => void;
  /** Nombre accesible del grupo de pestañas. */
  label: string;
  className?: string;
}

/** Id del panel de una pestaña, para enlazar `TabPanel` con su botón. */
export const tabPanelId = (base: string, value: string) => `${base}-panel-${value}`;
const tabId = (base: string, value: string) => `${base}-tab-${value}`;

/**
 * Pestañas subrayadas (patrón ARIA tabs con activación automática): flechas, Inicio y Fin
 * mueven el foco y la selección. Usar con `TabPanel` y el mismo `idBase`.
 */
export function Tabs<V extends string>({
  items,
  value,
  onValueChange,
  label,
  className,
  idBase,
}: TabsProps<V> & { idBase: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((i) => i.value === value);
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : e.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    const item = items[next];
    if (!item) return;
    e.preventDefault();
    onValueChange(item.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none]',
        className,
      )}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, item.value)}
            aria-selected={selected}
            aria-controls={tabPanelId(idBase, item.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              selected
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-input hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-md px-1.5 py-px text-xs tabular-nums',
                  selected ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {nf.format(item.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  value,
  children,
  className,
}: {
  idBase: string;
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idBase, value)}
      aria-labelledby={tabId(idBase, value)}
      className={className}
    >
      {children}
    </div>
  );
}

/** Id estable para enlazar `Tabs` y `TabPanel` dentro de un componente. */
export function useTabsId(): string {
  return useId().replace(/:/g, '');
}
