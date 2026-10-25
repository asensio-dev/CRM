import type { CycleCoverageDto, ExecutiveStatsDto, ExecutivesDto } from '@axiom/contracts';
import { ArrowDown, ArrowUp, ChevronsUpDown, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDayMonth } from '@/shared/lib/managua-time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { formatInt, formatPct } from './format';
import { ProgressBar } from './kpi-tiles';

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
  const rows = useMemo(
    () => sortExecutives(data.executives, sort.key, sort.dir),
    [data.executives, sort],
  );
  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'fullName' ? 'asc' : 'desc' },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ejecutivos</CardTitle>
        <CardDescription>
          Semana del {formatDayMonth(data.week.start)} al {formatDayMonth(data.week.end)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Sin ejecutivos con cartera" className="py-8" />
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
                      className={c.numeric ? 'min-w-28' : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              {rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.fullName}</TableCell>
                  <TableCell className="min-w-44">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs tabular-nums">
                        <span>
                          {formatInt(r.contactedThisWeek)} / {formatInt(r.weeklyQuota)}
                        </span>
                        <span className="text-muted-foreground">{formatPct(r.quotaPct)}</span>
                      </div>
                      <ProgressBar value={r.quotaPct} label={`Cuota semanal de ${r.fullName}`} />
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatPct(r.cycleCoveragePct)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatInt(r.statusAdvancesThisWeek)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatInt(r.appointmentsThisWeek)}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatInt(r.contractsActive)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function CoverageCard({ data }: { data: CycleCoverageDto }) {
  const { cycle, totals } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobertura del ciclo</CardTitle>
        <CardDescription>
          {cycle
            ? `Ciclo ${cycle.number} · semana ${cycle.weekNumber} de ${cycle.totalWeeks} (${formatDayMonth(cycle.startDate)} – ${formatDayMonth(cycle.endDate)})`
            : 'No hay un ciclo activo.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!cycle || totals.assigned === 0 ? (
          <EmptyState icon={Users} title="Sin empresas asignadas en el ciclo" className="py-8" />
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatPct(totals.coveragePct)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatInt(totals.contacted)} contactadas · {formatInt(totals.pending)} pendientes
                  de {formatInt(totals.assigned)}
                </p>
              </div>
              <ProgressBar value={totals.coveragePct} label="Cobertura total del ciclo" />
            </div>
            <ul className="space-y-3">
              {data.executives.map((e) => (
                <li key={e.userId} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{e.fullName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatInt(e.contacted)} / {formatInt(e.assigned)} ·{' '}
                      {formatPct(e.coveragePct)}
                    </span>
                  </div>
                  <ProgressBar value={e.coveragePct} label={`Cobertura de ${e.fullName}`} />
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
