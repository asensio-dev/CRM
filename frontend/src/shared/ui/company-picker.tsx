import type { CompanyListItem, Paginated } from '@axiom/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { Combobox, type ComboboxOption } from './combobox';
import { DEFAULT_PAGE_SIZE } from './pagination';

export type { ComboboxOption as CompanyOption };

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface CompanyPickerProps {
  id?: string;
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
}

/** Selector de empresa con búsqueda asíncrona sobre `GET /api/companies?q=`. */
export function CompanyPicker({
  id,
  value,
  onChange,
  invalid,
  disabled,
  clearable = true,
  placeholder = 'Buscar empresa…',
}: CompanyPickerProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(query.trim(), 250);
  const search = useQuery({
    queryKey: ['companies', 'picker', debounced, page],
    queryFn: ({ signal }) =>
      api.get<Paginated<CompanyListItem>>(
        `/companies?${new URLSearchParams({ ...(debounced ? { q: debounced } : {}), page: String(page), pageSize: String(PAGE_SIZE) })}`,
        signal,
      ),
    staleTime: 30_000,
  });
  const options: ComboboxOption[] =
    search.data?.items.map((c) => ({
      id: c.id,
      name: c.tradeName ? `${c.legalName} (${c.tradeName})` : c.legalName,
    })) ?? [];
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      query={query}
      onQueryChange={(q) => {
        setQuery(q);
        setPage(1);
      }}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: search.data?.total ?? 0,
        onPageChange: setPage,
      }}
      isLoading={search.isFetching}
      placeholder={placeholder}
      searchPlaceholder="Nombre o RUC de la empresa"
      emptyText="No se encontraron empresas"
      clearable={clearable}
      invalid={invalid}
      disabled={disabled}
    />
  );
}
