import { PIPELINE_STATUSES, type PipelineStatus } from '@axiom/contracts';
import { ChevronDown, Phone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { cn } from '@/shared/lib/cn';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Combobox } from '@/shared/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { SearchInput } from '@/shared/ui/search-input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { useActivities, useSectors } from './queries';
import { type CompaniesFilters, type CompaniesSearch, countActiveFilters } from './search';

interface Props {
  search: CompaniesSearch;
  /** Aplica cambios de filtros (la página vuelve a 1). */
  onChange: (patch: Partial<CompaniesFilters>) => void;
  onClear: () => void;
}

const RANGE_INPUT =
  'h-full w-16 bg-transparent px-2 text-sm tabular-nums placeholder:text-muted-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** Entero opcional desde un input: '' → undefined. */
const toInt = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

function StatusFilter({
  value,
  onChange,
}: {
  value: PipelineStatus[];
  onChange: (v: PipelineStatus[] | undefined) => void;
}) {
  const toggle = (s: PipelineStatus, on: boolean) => {
    const next = on ? [...value, s] : value.filter((x) => x !== s);
    onChange(next.length ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-between font-normal sm:w-44',
            value.length > 0 && 'border-primary/40 bg-accent text-accent-foreground',
          )}
        >
          <span className="truncate">
            {value.length === 0
              ? 'Todos los estados'
              : value.length === 1
                ? PIPELINE_STATUS_STYLES[value[0] as PipelineStatus].label
                : `${value.length} estados`}
          </span>
          <ChevronDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1.5" aria-label="Filtrar por estado">
        <ul className="space-y-1">
          {PIPELINE_STATUSES.map((s) => (
            <li key={s}>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: el control (Checkbox) está dentro del label. */}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  checked={value.includes(s)}
                  onCheckedChange={(c) => toggle(s, c === true)}
                />
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', PIPELINE_STATUS_STYLES[s].dot)}
                />
                {PIPELINE_STATUS_STYLES[s].label}
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function CompanyFilters({ search, onChange, onClear }: Props) {
  // Texto con debounce: el input es local y la URL se actualiza al dejar de teclear.
  const [q, setQ] = useState(search.q ?? '');
  const debouncedQ = useDebouncedValue(q, 350);
  const emittedQ = useRef(search.q);
  const [min, setMin] = useState(search.minEmployees?.toString() ?? '');
  const [max, setMax] = useState(search.maxEmployees?.toString() ?? '');
  const dMin = useDebouncedValue(min, 400);
  const dMax = useDebouncedValue(max, 400);
  const emittedRange = useRef(`${search.minEmployees ?? ''}-${search.maxEmployees ?? ''}`);

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo reacciona al texto debounced.
  useEffect(() => {
    const next = debouncedQ.trim() || undefined;
    if (next !== search.q) {
      emittedQ.current = next;
      onChange({ q: next });
    }
  }, [debouncedQ]);
  // Si la URL cambia desde fuera (limpiar filtros, atrás/adelante), sincroniza el input.
  useEffect(() => {
    if (search.q !== emittedQ.current) {
      emittedQ.current = search.q;
      setQ(search.q ?? '');
    }
  }, [search.q]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo reacciona al texto debounced.
  useEffect(() => {
    if (toInt(dMin) !== search.minEmployees || toInt(dMax) !== search.maxEmployees) {
      emittedRange.current = `${toInt(dMin) ?? ''}-${toInt(dMax) ?? ''}`;
      onChange({ minEmployees: toInt(dMin), maxEmployees: toInt(dMax) });
    }
  }, [dMin, dMax]);
  useEffect(() => {
    const key = `${search.minEmployees ?? ''}-${search.maxEmployees ?? ''}`;
    if (key !== emittedRange.current) {
      emittedRange.current = key;
      setMin(search.minEmployees?.toString() ?? '');
      setMax(search.maxEmployees?.toString() ?? '');
    }
  }, [search.minEmployees, search.maxEmployees]);

  const sectors = useSectors();
  const [activityQuery, setActivityQuery] = useState('');
  const dActivityQuery = useDebouncedValue(activityQuery, 250);
  const activities = useActivities(dActivityQuery.trim());
  const active = countActiveFilters(search);
  const rangeInvalid =
    search.minEmployees !== undefined &&
    search.maxEmployees !== undefined &&
    search.minEmployees > search.maxEmployees;

  const sectorOptions = sectors.data ?? [];
  const sectorValue =
    search.sectorId !== undefined
      ? (sectorOptions.find((s) => s.id === search.sectorId) ?? {
          id: search.sectorId,
          name: `Sector ${search.sectorId}`,
        })
      : null;

  return (
    <section aria-label="Filtros" className="space-y-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Buscar por RUC, razón social o nombre comercial"
          aria-label="Buscar empresas"
          className="w-full lg:w-80"
        />
        <StatusFilter value={search.status ?? []} onChange={(status) => onChange({ status })} />
        <SearchableSelect
          id="filter-sector"
          aria-label="Sector"
          value={sectorValue}
          onChange={(o) => onChange({ sectorId: o?.id })}
          options={sectorOptions}
          isLoading={sectors.isPending}
          placeholder="Todos los sectores"
          searchPlaceholder="Buscar sector…"
          className="w-full sm:w-48"
        />
        <Combobox
          id="filter-activity"
          aria-label="Actividad"
          value={
            search.activityId !== undefined
              ? {
                  id: search.activityId,
                  name: search.activityName ?? `Actividad ${search.activityId}`,
                }
              : null
          }
          onChange={(o) => onChange({ activityId: o?.id, activityName: o?.name })}
          options={activities.data ?? []}
          query={activityQuery}
          onQueryChange={setActivityQuery}
          isLoading={activities.isFetching}
          placeholder="Todas las actividades"
          searchPlaceholder="Buscar actividad…"
          className="w-full sm:w-56"
        />
        <fieldset
          className={cn(
            'flex h-9 items-center rounded-lg border border-input bg-card pl-3 shadow-xs focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20',
            rangeInvalid && 'border-destructive',
          )}
        >
          <legend className="sr-only">Empleados</legend>
          <span aria-hidden="true" className="text-sm text-muted-foreground">
            Empleados
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="Mín."
            aria-label="Mínimo de empleados"
            aria-invalid={rangeInvalid}
            className={RANGE_INPUT}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="Máx."
            aria-label="Máximo de empleados"
            aria-invalid={rangeInvalid}
            className={RANGE_INPUT}
          />
        </fieldset>
        <Button
          variant="outline"
          aria-pressed={!!search.hasPhone}
          onClick={() => onChange({ hasPhone: search.hasPhone ? undefined : true })}
          className={cn(
            'font-normal',
            search.hasPhone &&
              'border-primary/40 bg-accent text-accent-foreground hover:bg-accent/70',
          )}
        >
          <Phone aria-hidden="true" />
          Con teléfono
        </Button>
        {active > 0 && (
          <Button variant="ghost" onClick={onClear} className="lg:ml-auto">
            <X aria-hidden="true" /> Limpiar filtros ({active})
          </Button>
        )}
      </div>
      {rangeInvalid && (
        <p role="alert" className="text-xs text-destructive">
          El mínimo de empleados no puede ser mayor que el máximo.
        </p>
      )}
    </section>
  );
}
