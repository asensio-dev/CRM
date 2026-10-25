import { INTERACTION_OUTCOMES, type WeeklyActivityDto } from '@axiom/contracts';
import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OUTCOME_LABELS } from '@/features/pipeline/labels';
import { formatDayMonth, formatDayMonthYear } from '@/shared/lib/managua-time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatInt } from './format';

export const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export const OUTCOME_COLORS: Record<(typeof INTERACTION_OUTCOMES)[number], string> = {
  CONTESTO: SERIES_COLORS[0],
  INTERESADO: SERIES_COLORS[2],
  VOLVER_A_LLAMAR: SERIES_COLORS[4],
  NO_CONTESTO: SERIES_COLORS[1],
  NO_INTERESADO: SERIES_COLORS[5],
  NUMERO_EQUIVOCADO: SERIES_COLORS[3],
};

const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--foreground)',
  fontSize: 12,
};
const axisTick = { fill: 'var(--chart-axis)', fontSize: 12 };
const tickDay = (v: string) => formatDayMonth(v);
const tooltipLabel = (v: unknown) => `Semana del ${formatDayMonthYear(String(v))}`;
const tooltipNumber = (v: unknown) => formatInt(Number(v));

function hasActivity(data: WeeklyActivityDto | undefined): boolean {
  return !!data?.weeks.some((w) => w.interactions > 0 || w.companiesContacted > 0);
}

/** Tabla accesible equivalente al gráfico (solo lectores de pantalla). */
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]}>
            {r.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: celdas posicionales.
              <td key={i}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ExecSeries {
  key: string;
  name: string;
  color: string;
}

/** Hasta 5 ejecutivos con más actividad; el resto se agrupa en "Otros". */
export function pivotExecutives(data: WeeklyActivityDto) {
  const totals = new Map<number, { name: string; total: number }>();
  for (const w of data.weeks) {
    for (const e of w.executives ?? []) {
      const cur = totals.get(e.userId) ?? { name: e.fullName, total: 0 };
      cur.total += e.interactions;
      totals.set(e.userId, cur);
    }
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  const top = ranked.slice(0, 5);
  const series: ExecSeries[] = top.map(([id, v], i) => ({
    key: `u${id}`,
    name: v.name,
    color: SERIES_COLORS[i] ?? SERIES_COLORS[5],
  }));
  const topIds = new Set(top.map(([id]) => id));
  const hasOthers = ranked.length > top.length;
  if (hasOthers) series.push({ key: 'others', name: 'Otros', color: SERIES_COLORS[5] });
  const rows = data.weeks.map((w) => {
    const row: Record<string, number | string> = { weekStart: w.weekStart };
    for (const s of series) row[s.key] = 0;
    for (const e of w.executives ?? []) {
      const key = topIds.has(e.userId) ? `u${e.userId}` : 'others';
      row[key] = Number(row[key] ?? 0) + e.interactions;
    }
    return row;
  });
  return { series, rows };
}

export function WeeklyActivityCard({
  data,
  byExecutive,
}: {
  data: WeeklyActivityDto | undefined;
  byExecutive: boolean;
}) {
  const pivot = useMemo(
    () => (data && byExecutive ? pivotExecutives(data) : null),
    [data, byExecutive],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad semanal</CardTitle>
        <CardDescription>
          {byExecutive
            ? 'Interacciones por ejecutivo en las últimas 12 semanas.'
            : 'Interacciones y empresas distintas contactadas por semana (últimas 12).'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasActivity(data) || !data ? (
          <EmptyState icon={Activity} title="Sin actividad registrada" className="py-8" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {pivot ? (
                <ComposedChart
                  data={pivot.rows}
                  margin={{ top: 8, right: 12, bottom: 16, left: 4 }}
                >
                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="weekStart"
                    tickFormatter={tickDay}
                    tick={axisTick}
                    label={{
                      value: 'Semana (inicio lunes)',
                      position: 'insideBottom',
                      offset: -10,
                      fill: 'var(--chart-axis)',
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    tick={axisTick}
                    allowDecimals={false}
                    label={{
                      value: 'Interacciones',
                      angle: -90,
                      position: 'insideLeft',
                      fill: 'var(--chart-axis)',
                      fontSize: 12,
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={tooltipLabel}
                    formatter={tooltipNumber}
                  />
                  <Legend verticalAlign="top" height={28} />
                  {pivot.series.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </ComposedChart>
              ) : (
                <ComposedChart
                  data={data.weeks}
                  margin={{ top: 8, right: 12, bottom: 16, left: 4 }}
                >
                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="weekStart"
                    tickFormatter={tickDay}
                    tick={axisTick}
                    label={{
                      value: 'Semana (inicio lunes)',
                      position: 'insideBottom',
                      offset: -10,
                      fill: 'var(--chart-axis)',
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    tick={axisTick}
                    allowDecimals={false}
                    label={{
                      value: 'Cantidad',
                      angle: -90,
                      position: 'insideLeft',
                      fill: 'var(--chart-axis)',
                      fontSize: 12,
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={tooltipLabel}
                    formatter={tooltipNumber}
                  />
                  <Legend verticalAlign="top" height={28} />
                  <Area
                    type="monotone"
                    dataKey="interactions"
                    name="Interacciones"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="companiesContacted"
                    name="Empresas distintas"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
        <SrTable
          caption="Actividad semanal"
          head={['Semana', 'Interacciones', 'Empresas distintas']}
          rows={(data?.weeks ?? []).map((w) => [
            w.weekStart,
            String(w.interactions),
            String(w.companiesContacted),
          ])}
        />
      </CardContent>
    </Card>
  );
}

export function OutcomesCard({ data }: { data: WeeklyActivityDto | undefined }) {
  const rows = useMemo(
    () => (data?.weeks ?? []).map((w) => ({ weekStart: w.weekStart, ...w.byOutcome })),
    [data],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultados por semana</CardTitle>
        <CardDescription>Interacciones apiladas según su resultado.</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasActivity(data) ? (
          <EmptyState icon={Activity} title="Sin actividad registrada" className="py-8" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 16, left: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={tickDay}
                  tick={axisTick}
                  label={{
                    value: 'Semana (inicio lunes)',
                    position: 'insideBottom',
                    offset: -10,
                    fill: 'var(--chart-axis)',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tick={axisTick}
                  allowDecimals={false}
                  label={{
                    value: 'Interacciones',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--chart-axis)',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={tooltipLabel}
                  formatter={tooltipNumber}
                  cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                />
                <Legend verticalAlign="top" height={44} />
                {INTERACTION_OUTCOMES.map((o) => (
                  <Bar
                    key={o}
                    dataKey={o}
                    name={OUTCOME_LABELS[o]}
                    stackId="outcomes"
                    fill={OUTCOME_COLORS[o]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <SrTable
          caption="Resultados por semana"
          head={['Semana', ...INTERACTION_OUTCOMES.map((o) => OUTCOME_LABELS[o])]}
          rows={(data?.weeks ?? []).map((w) => [
            w.weekStart,
            ...INTERACTION_OUTCOMES.map((o) => String(w.byOutcome[o])),
          ])}
        />
      </CardContent>
    </Card>
  );
}
