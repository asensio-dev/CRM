import type { CompanyListItem, Paginated } from '@axiom/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { Combobox, type ComboboxOption } from './combobox';

export type { ComboboxOption as CompanyOption };

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
  const debounced = useDebouncedValue(query.trim(), 250);
  const search = useQuery({
    queryKey: ['companies', 'picker', debounced],
    queryFn: ({ signal }) =>
      api.get<Paginated<CompanyListItem>>(
        `/companies?${new URLSearchParams({ ...(debounced ? { q: debounced } : {}), pageSize: '15' })}`,
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
      onQueryChange={setQuery}
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
