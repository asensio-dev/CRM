import { INTERACTION_OUTCOMES, type WeeklyActivityDto } from '@axiom/contracts';
import { Activity } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import {
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

const axisTick = { fill: 'var(--chart-axis)', fontSize: 12 };
const axisProps = { tick: axisTick, axisLine: false, tickLine: false } as const;
const legendStyle = { fontSize: 12, color: 'var(--muted-foreground)' };
const margin = { top: 8, right: 8, bottom: 4, left: -12 };
const tickDay = (v: string) => formatDayMonth(v);
/** Pista fantasma detrás de cada barra. */
const TRACK = { fill: 'var(--track)', radius: 6 };

/**
 * Los gráficos animan al aparecer y no en cada recarga: con `keepPreviousData` cada refetch
 * volvía a lanzar la animación y el gráfico parpadeaba.
 */
function useAnimateOnce(ms = 900): boolean {
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return animate;
}

function hasActivity(data: WeeklyActivityDto | undefined): boolean {
  return !!data?.weeks.some((w) => w.interactions > 0 || w.companiesContacted > 0);
}

/** Identificador apto para `url(#…)` (useId devuelve dos puntos). */
function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

interface TooltipEntry {
  name?: unknown;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}

/** Tarjeta blanca del tooltip: semana, y una fila por serie con su color. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-lg border bg-card px-3 py-2.5 text-xs text-card-foreground shadow-md">
      <p className="mb-1.5 font-medium">Semana del {formatDayMonthYear(String(label))}</p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: p.color }}
              />
              {String(p.name)}
            </span>
            <span className="font-semibold tabular-nums">{formatInt(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const renderTooltip = (props: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
}): ReactNode => <ChartTooltip {...props} />;

/** Tabla accesible equivalente al gráfico (solo lectores de pantalla). */
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    // El contenedor sr-only (1px + overflow oculto) recorta la tabla: así no ensancha el scroll.
    <div className="sr-only">
      <table>
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
    </div>
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
  action,
}: {
  data: WeeklyActivityDto | undefined;
  byExecutive: boolean;
  /** Control opcional en la cabecera (p. ej. "Ver actividad por ejecutivo"). */
  action?: ReactNode;
}) {
  const gradientId = useSvgId('weekly-fill');
  const animate = useAnimateOnce();
  const pivot = useMemo(
    () => (data && byExecutive ? pivotExecutives(data) : null),
    [data, byExecutive],
  );
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Actividad semanal</CardTitle>
          <CardDescription>
            {byExecutive
              ? 'Interacciones por ejecutivo en las últimas 12 semanas.'
              : 'Interacciones y empresas distintas contactadas por semana (últimas 12).'}
          </CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent>
        {!hasActivity(data) || !data ? (
          <EmptyState icon={Activity} title="Sin actividad registrada" className="py-8" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {pivot ? (
                <ComposedChart data={pivot.rows} margin={margin}>
                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis dataKey="weekStart" tickFormatter={tickDay} {...axisProps} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip
                    content={renderTooltip}
                    cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={32}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={legendStyle}
                  />
                  {pivot.series.map((s) => (
                    <Line
                      isAnimationActive={animate}
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                    />
                  ))}
                </ComposedChart>
              ) : (
                <ComposedChart data={data.weeks} margin={margin} barCategoryGap="28%">
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--fill)" />
                      <stop offset="100%" stopColor="var(--fill-soft)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis dataKey="weekStart" tickFormatter={tickDay} {...axisProps} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip content={renderTooltip} cursor={false} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={32}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={legendStyle}
                  />
                  <Bar
                    isAnimationActive={animate}
                    dataKey="interactions"
                    name="Interacciones"
                    fill={`url(#${gradientId})`}
                    background={TRACK}
                    radius={[6, 6, 6, 6]}
                    activeBar={{ fill: 'var(--fill)' }}
                    maxBarSize={36}
                  />
                  <Line
                    isAnimationActive={animate}
                    type="monotone"
                    dataKey="companiesContacted"
                    name="Empresas distintas"
                    stroke="var(--foreground)"
                    strokeOpacity={0.75}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: 'var(--card)', strokeWidth: 2 }}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
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
  const animate = useAnimateOnce();
  const rows = useMemo(
    () => (data?.weeks ?? []).map((w) => ({ weekStart: w.weekStart, ...w.byOutcome })),
    [data],
  );
  const last = INTERACTION_OUTCOMES.length - 1;
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
              <BarChart data={rows} margin={margin} barCategoryGap="28%">
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="weekStart" tickFormatter={tickDay} {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip content={renderTooltip} cursor={false} />
                <Legend
                  verticalAlign="top"
                  height={44}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={legendStyle}
                />
                {INTERACTION_OUTCOMES.map((o, i) => (
                  <Bar
                    isAnimationActive={animate}
                    key={o}
                    dataKey={o}
                    name={OUTCOME_LABELS[o]}
                    stackId="outcomes"
                    fill={OUTCOME_COLORS[o]}
                    // La pista fantasma va en la primera serie (debajo de toda la pila).
                    background={i === 0 ? TRACK : undefined}
                    radius={i === last ? [6, 6, 0, 0] : undefined}
                    maxBarSize={36}
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
