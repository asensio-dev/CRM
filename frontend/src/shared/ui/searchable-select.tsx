import { useClientList } from '../hooks/use-client-list';
import { Combobox, type ComboboxOption } from './combobox';
import { DEFAULT_PAGE_SIZE } from './pagination';

interface SearchableSelectProps {
  id?: string;
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  /** Catálogo completo ya cargado; la búsqueda y la paginación se hacen en cliente. */
  options: readonly ComboboxOption[];
  isLoading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  pageSize?: number;
  'aria-label'?: string;
}

const optionText = (o: ComboboxOption) => o.name;

/** Selector con buscador y resultados paginados sobre un catálogo local (ejecutivos, ciclos…). */
export function SearchableSelect({
  options,
  pageSize = DEFAULT_PAGE_SIZE,
  ...props
}: SearchableSelectProps) {
  const list = useClientList(options, { searchText: optionText, pageSize });
  return (
    <Combobox
      {...props}
      options={list.pageItems}
      query={list.query}
      onQueryChange={list.setQuery}
      pagination={{
        page: list.page,
        pageSize: list.pageSize,
        total: list.total,
        onPageChange: list.setPage,
      }}
    />
  );
}
