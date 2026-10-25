import { PIPELINE_STATUSES, type PipelineStatus } from '@axiom/contracts';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Combobox } from '@/shared/ui/combobox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select } from '@/shared/ui/select';
import { useActivities, useSectors } from './queries';
import { type CompaniesFilters, type CompaniesSearch, countActiveFilters } from './search';

interface Props {
  search: CompaniesSearch;
  /** Aplica cambios de filtros (la página vuelve a 1). */
  onChange: (patch: Partial<CompaniesFilters>) => void;
  onClear: () => void;
}

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
        <Button variant="outline" className="w-full justify-between font-normal sm:w-44">
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
      <PopoverContent className="w-60" aria-label="Filtrar por estado">
        <ul className="space-y-1">
          {PIPELINE_STATUSES.map((s) => (
            <li key={s}>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: el control (Checkbox) está dentro del label. */}
              <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                <Checkbox
                  checked={value.includes(s)}
                  onCheckedChange={(c) => toggle(s, c === true)}
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

  return (
    <section aria-label="Filtros" className="space-y-3 border-b p-3 sm:p-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por RUC, razón social o nombre comercial"
          aria-label="Buscar empresas"
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1 sm:w-auto">
          <Label className="text-xs text-muted-foreground">Estado</Label>
          <StatusFilter value={search.status ?? []} onChange={(status) => onChange({ status })} />
        </div>
        <div className="w-full space-y-1 sm:w-52">
          <Label htmlFor="filter-sector" className="text-xs text-muted-foreground">
            Sector
          </Label>
          <Select
            id="filter-sector"
            value={search.sectorId ?? ''}
            onChange={(e) =>
              onChange({ sectorId: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">Todos los sectores</option>
            {sectors.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full space-y-1 sm:w-64">
          <Label htmlFor="filter-activity" className="text-xs text-muted-foreground">
            Actividad
          </Label>
          <Combobox
            id="filter-activity"
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
          />
        </div>
        <fieldset className="flex items-end gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">Empleados</legend>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="Mín."
            aria-label="Mínimo de empleados"
            aria-invalid={rangeInvalid}
            className="w-20"
          />
          <span className="pb-2 text-muted-foreground">–</span>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="Máx."
            aria-label="Máximo de empleados"
            aria-invalid={rangeInvalid}
            className="w-20"
          />
        </fieldset>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: el control (Checkbox) está dentro del label. */}
        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={!!search.hasPhone}
            onCheckedChange={(c) => onChange({ hasPhone: c === true ? true : undefined })}
          />
          Con teléfono
        </label>
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
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
