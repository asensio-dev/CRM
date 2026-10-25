import type { SummaryDto, WeeklyActivityPointDto } from '@axiom/contracts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatMoney } from '@/shared/lib/money';
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { barWidth, formatDelta, formatInt, formatPct } from './format';

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 96;
  const h = 28;
  const step = w / (values.length - 1);
  const points = values.map(
    (v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`,
  );
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={label}
      className="text-[var(--chart-1)]"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Tile({
  label,
  value,
  children,
  testId,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export function ProgressBar({
  value,
  label,
  className,
}: {
  /** Porcentaje real (puede ser >100); la barra se recorta a 100. */
  value: number | null | undefined;
  label: string;
  className?: string;
}) {
  const over = typeof value === 'number' && value > 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(barWidth(value))}
      aria-valuetext={formatPct(value)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full', over ? 'bg-emerald-500' : 'bg-primary')}
        style={{ width: `${barWidth(value)}%` }}
      />
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando indicadores"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: esqueletos estáticos.
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

export function KpiTiles({
  summary,
  weeks,
}: {
  summary: SummaryDto;
  /** Semanas de actividad (más antigua → más reciente) para el sparkline y el delta. */
  weeks?: WeeklyActivityPointDto[];
}) {
  const { companies, weeklyQuota, contractsActive, conversion } = summary;
  const contacts = weeks?.map((w) => w.companiesContacted) ?? [];
  const delta =
    contacts.length >= 2 ? formatDelta(summary.contactsThisWeek, contacts.at(-2) ?? 0) : null;
  const compliance = weeklyQuota.compliancePct;

  return (
    <section aria-label="Indicadores clave" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Empresas" value={formatInt(companies.total)} testId="kpi-companies" />
      <Tile label="En pipeline" value={formatInt(companies.inPipeline)} testId="kpi-pipeline">
        <p className="text-xs text-muted-foreground">Ya salieron de “Por contactar”</p>
      </Tile>
      <Tile
        label="Contactos esta semana"
        value={formatInt(summary.contactsThisWeek)}
        testId="kpi-contacts"
      >
        <div className="flex items-end justify-between gap-2">
          {delta ? (
            <p
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                delta.tone === 'up' && 'text-emerald-700 dark:text-emerald-400',
                delta.tone === 'down' && 'text-destructive',
                delta.tone === 'flat' && 'text-muted-foreground',
              )}
            >
              {delta.tone === 'up' && <TrendingUp className="size-3.5" aria-hidden="true" />}
              {delta.tone === 'down' && <TrendingDown className="size-3.5" aria-hidden="true" />}
              {delta.text}
            </p>
          ) : (
            <span />
          )}
          <Sparkline
            values={contacts}
            label="Empresas contactadas por semana, últimas 12 semanas"
          />
        </div>
      </Tile>
      <Tile
        label="Cumplimiento de cuota semanal"
        value={formatPct(compliance)}
        testId="kpi-compliance"
      >
        <ProgressBar value={compliance} label="Cumplimiento de cuota semanal" />
        <p className="text-xs text-muted-foreground">
          {formatInt(summary.contactsThisWeek)} de {formatInt(weeklyQuota.target)} contactos
          {typeof compliance === 'number' && compliance > 100 && (
            <span className="ml-1 font-medium text-emerald-700 dark:text-emerald-400">
              · Meta superada
            </span>
          )}
        </p>
      </Tile>
      <Tile
        label="Citas esta semana"
        value={formatInt(summary.appointmentsThisWeek)}
        testId="kpi-appointments"
      />
      <Tile
        label="Contratos activos"
        value={formatInt(contractsActive.count)}
        testId="kpi-contracts"
      >
        {contractsActive.totalsByCurrency.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin montos</p>
        ) : (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {contractsActive.totalsByCurrency.map((t) => (
              <li key={t.currency} className="tabular-nums">
                <span className="font-medium text-foreground">
                  {formatMoney(t.totalAmount, t.currency)}
                </span>{' '}
                · {formatInt(t.count)} {t.count === 1 ? 'contrato' : 'contratos'}
              </li>
            ))}
          </ul>
        )}
      </Tile>
      <Tile
        label="Tasa de conversión"
        value={formatPct(conversion.ratePct)}
        testId="kpi-conversion"
      >
        <p className="text-xs text-muted-foreground">
          {formatInt(conversion.contracted)} con contrato de {formatInt(conversion.contacted)}{' '}
          contactadas
        </p>
      </Tile>
    </section>
  );
}
