import type { CycleCoverageDto, ExecutiveStatsDto, ExecutivesDto } from '@axiom/contracts';
import { ArrowDown, ArrowUp, ChevronsUpDown, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useClientList } from '@/shared/hooks/use-client-list';
import { formatDayMonth } from '@/shared/lib/managua-time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Meter } from '@/shared/ui/meter';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, Pagination } from '@/shared/ui/pagination';
import { SearchInput } from '@/shared/ui/search-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { formatInt, formatPct } from './format';

type SortKey =
  | 'fullName'
  | 'contactedThisWeek'
  | 'quotaPct'
  | 'cycleCoveragePct'
  | 'statusAdvancesThisWeek'
  | 'appointmentsThisWeek'
  | 'contractsActive';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'fullName', label: 'Ejecutivo' },
  { key: 'quotaPct', label: 'Contactos vs cuota', numeric: true },
  { key: 'cycleCoveragePct', label: 'Cobertura del ciclo', numeric: true },
  { key: 'statusAdvancesThisWeek', label: 'Avances', numeric: true },
  { key: 'appointmentsThisWeek', label: 'Citas', numeric: true },
  { key: 'contractsActive', label: 'Contratos', numeric: true },
];

export const EXECUTIVES_PAGE_SIZES = DEFAULT_PAGE_SIZE_OPTIONS;
const COVERAGE_PAGE_SIZE = DEFAULT_PAGE_SIZE;

const executiveName = (r: { fullName: string }) => r.fullName;

/** Porcentaje (puede pasar de 100) a medidor: la barra se recorta, el texto no. */
function PctMeter({ value, label }: { value: number | null; label: string }) {
  return (
    <Meter
      value={value ?? 0}
      max={100}
      complete={typeof value === 'number' && value >= 100}
      label={label}
      size="sm"
    />
  );
}

export function sortExecutives(
  rows: readonly ExecutiveStatsDto[],
  key: SortKey,
  dir: 'asc' | 'desc',
): ExecutiveStatsDto[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (key === 'fullName') return factor * String(av).localeCompare(String(bv), 'es');
    // null (sin denominador) siempre al final
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return factor * (Number(av) - Number(bv));
  });
}

export function ExecutivesCard({ data }: { data: ExecutivesDto }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'quotaPct',
    dir: 'desc',
  });
  const sorted = useMemo(
    () => sortExecutives(data.executives, sort.key, sort.dir),
    [data.executives, sort],
  );
  // El API devuelve a todos los ejecutivos con cartera: búsqueda y paginación en cliente.
  const list = useClientList(sorted, { searchText: executiveName, pageSize: DEFAULT_PAGE_SIZE });
  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'fullName' ? 'asc' : 'desc' },
    );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-3 border-b">
        <div className="space-y-1">
          <CardTitle>Ejecutivos</CardTitle>
          <CardDescription>
            Semana del {formatDayMonth(data.week.start)} al {formatDayMonth(data.week.end)}
          </CardDescription>
        </div>
        {data.executives.length > 0 && (
          <SearchInput
            value={list.query}
            onValueChange={list.setQuery}
            placeholder="Buscar ejecutivo…"
            className="sm:w-64"
          />
        )}
      </CardHeader>
      {data.executives.length === 0 ? (
        <CardContent className="pt-5">
          <EmptyState icon={Users} title="Sin ejecutivos con cartera" className="py-8" />
        </CardContent>
      ) : list.total === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Ningún ejecutivo coincide con la búsqueda.
        </p>
      ) : (
        <Table>
          <caption className="sr-only">Desempeño por ejecutivo</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <TableHead
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={c.numeric ? 'min-w-28' : 'pl-5'}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {c.label}
                      {active ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="pl-5 font-medium">{r.fullName}</TableCell>
                <TableCell className="min-w-48">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs tabular-nums">
                      <span className="font-medium">
                        {formatInt(r.contactedThisWeek)} / {formatInt(r.weeklyQuota)}
                      </span>
                      <span className="text-muted-foreground">{formatPct(r.quotaPct)}</span>
                    </div>
                    <PctMeter value={r.quotaPct} label={`Cuota semanal de ${r.fullName}`} />
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{formatPct(r.cycleCoveragePct)}</TableCell>
                <TableCell className="tabular-nums">
                  {formatInt(r.statusAdvancesThisWeek)}
                </TableCell>
                <TableCell className="tabular-nums">{formatInt(r.appointmentsThisWeek)}</TableCell>
                <TableCell className="tabular-nums">{formatInt(r.contractsActive)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {list.total > EXECUTIVES_PAGE_SIZES[0] && (
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          pageSizeOptions={EXECUTIVES_PAGE_SIZES}
          itemLabel="ejecutivos"
        />
      )}
    </Card>
  );
}

export function CoverageCard({ data }: { data: CycleCoverageDto }) {
  const { cycle, totals } = data;
  const list = useClientList(data.executives, {
    searchText: executiveName,
    pageSize: COVERAGE_PAGE_SIZE,
  });
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Cobertura del ciclo</CardTitle>
        <CardDescription>
          {cycle
            ? `Ciclo ${cycle.number} · semana ${cycle.weekNumber} de ${cycle.totalWeeks} (${formatDayMonth(cycle.startDate)} – ${formatDayMonth(cycle.endDate)})`
            : 'No hay un ciclo activo.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {!cycle || totals.assigned === 0 ? (
          <EmptyState icon={Users} title="Sin empresas asignadas en el ciclo" className="py-8" />
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[1.9rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                  {formatPct(totals.coveragePct)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatInt(totals.contacted)} contactadas · {formatInt(totals.pending)} pendientes
                  de {formatInt(totals.assigned)}
                </p>
              </div>
              <Meter
                value={totals.coveragePct ?? 0}
                max={100}
                size="lg"
                complete={typeof totals.coveragePct === 'number' && totals.coveragePct >= 100}
                label="Cobertura total del ciclo"
              />
            </div>
            {data.executives.length > COVERAGE_PAGE_SIZE && (
              <SearchInput
                value={list.query}
                onValueChange={list.setQuery}
                placeholder="Buscar ejecutivo…"
              />
            )}
            <ul className="space-y-3.5">
              {list.pageItems.map((e) => (
                <li key={e.userId} className="space-y-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{e.fullName}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatInt(e.contacted)} / {formatInt(e.assigned)} ·{' '}
                      {formatPct(e.coveragePct)}
                    </span>
                  </div>
                  <PctMeter value={e.coveragePct} label={`Cobertura de ${e.fullName}`} />
                </li>
              ))}
              {list.total === 0 && (
                <li className="text-sm text-muted-foreground">
                  Ningún ejecutivo coincide con la búsqueda.
                </li>
              )}
            </ul>
            {list.total > COVERAGE_PAGE_SIZE && (
              <Pagination
                variant="compact"
                page={list.page}
                pageSize={list.pageSize}
                total={list.total}
                onPageChange={list.setPage}
                itemLabel="ejecutivos"
                className="mt-auto"
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
