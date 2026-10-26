import { normalizeSearchText } from '@axiom/contracts';
import { useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../ui/pagination';

interface UseClientListOptions<T> {
  /** Texto en el que se busca para cada elemento (se ignoran tildes y mayúsculas). */
  searchText?: (item: T) => string;
  pageSize?: number;
}

export interface ClientList<T> {
  query: string;
  setQuery: (q: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  /** Elementos que pasan el filtro (todas las páginas). */
  filtered: T[];
  /** Elementos de la página actual. */
  pageItems: T[];
  total: number;
}

/**
 * Búsqueda y paginación en cliente para listas que el API devuelve completas
 * (columnas del kanban, plan semanal, sucursales…). Cambiar la búsqueda vuelve a la página 1.
 */
export function useClientList<T>(
  items: readonly T[],
  { searchText, pageSize: initialPageSize = DEFAULT_PAGE_SIZE }: UseClientListOptions<T> = {},
): ClientList<T> {
  const [query, setQueryState] = useState('');
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q || !searchText) return [...items];
    return items.filter((item) => normalizeSearchText(searchText(item)).includes(q));
  }, [items, query, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Si la lista encoge (filtro, datos nuevos), la página actual se recorta al rango válido.
  const current = Math.min(page, pages);
  const pageItems = filtered.slice((current - 1) * pageSize, current * pageSize);

  return {
    query,
    setQuery: (q) => {
      setQueryState(q);
      setPageState(1);
    },
    page: current,
    setPage: setPageState,
    pageSize,
    setPageSize: (size) => {
      setPageSizeState(size);
      setPageState(1);
    },
    filtered,
    pageItems,
    total: filtered.length,
  };
}
