import { useState } from 'react';

/**
 * Pestaña activa recordada por pantalla durante la sesión del navegador (vuelves a Cartera y
 * sigues en la misma pestaña). Si el almacenamiento falla o el valor ya no existe, usa `fallback`.
 */
export function useRememberedTab<V extends string>(
  key: string,
  values: readonly V[],
  fallback: V,
): [V, (value: V) => void] {
  const storageKey = `axiom-tab:${key}`;
  const [tab, setTab] = useState<V>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      return values.includes(stored as V) ? (stored as V) : fallback;
    } catch {
      return fallback;
    }
  });
  const current = values.includes(tab) ? tab : fallback;
  return [
    current,
    (value) => {
      setTab(value);
      try {
        sessionStorage.setItem(storageKey, value);
      } catch {
        // Sin almacenamiento: la pestaña solo dura mientras la página está abierta.
      }
    },
  ];
}
