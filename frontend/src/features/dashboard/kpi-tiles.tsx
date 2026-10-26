import type { SummaryDto, WeeklyActivityPointDto } from '@axiom/contracts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatDayMonth } from '@/shared/lib/managua-time';
import { formatMoney } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { Meter } from '@/shared/ui/meter';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatDelta, formatInt, formatPct } from './format';

/** Mini gráfico de barras con pista fantasma; la última semana (la actual) va en azul sólido. */
function SparkBars({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 104;
  const h = 32;
  const gap = 2;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      {values.map((v, i) => {
        const x = i * (bw + gap);
        const bh = Math.max(v > 0 ? 2 : 0, (v / max) * h);
        const last = i === values.length - 1;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: barras posicionales por semana.
          <g key={i}>
            <rect x={x} y={0} width={bw} height={h} rx={2} fill="var(--track)" />
            <rect
              x={x}
              y={h - bh}
              width={bw}
              height={bh}
              rx={2}
              fill={last ? 'var(--fill)' : 'var(--fill-soft)'}
            />
          </g>
        );
      })}
    </svg>
  );
}

function Tile({
  label,
  value,
  children,
  testId,
  aside,
  size = 'lg',
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
  testId: string;
  aside?: ReactNode;
  size?: 'lg' | 'sm';
}) {
  return (
    <Card data-testid={testId} className={cn('flex flex-col gap-2', size === 'lg' ? 'p-5' : 'p-4')}>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p
          className={cn(
            'font-semibold tabular-nums leading-none tracking-[-0.02em]',
            size === 'lg' ? 'text-[1.9rem]' : 'text-xl',
          )}
        >
          {value}
        </p>
        {aside}
      </div>
      {children && <div className="mt-auto space-y-2 pt-1">{children}</div>}
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando indicadores" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: esqueletos estáticos.
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: esqueletos estáticos.
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Fila principal de cuatro indicadores (semana en curso) y una fila secundaria con el contexto
 * de la cartera. Solo muestra datos que devuelve el API.
 */
export function KpiTiles({
  summary,
  weeks,
}: {
  summary: SummaryDto;
  /** Semanas de actividad (más antigua → más reciente) para el mini gráfico y el delta. */
  weeks?: WeeklyActivityPointDto[];
}) {
  const { companies, weeklyQuota, contractsActive, conversion } = summary;
  const contacts = weeks?.map((w) => w.companiesContacted) ?? [];
  const delta =
    contacts.length >= 2 ? formatDelta(summary.contactsThisWeek, contacts.at(-2) ?? 0) : null;
  const compliance = weeklyQuota.compliancePct;
  const over = typeof compliance === 'number' && compliance > 100;

  return (
    <section aria-label="Indicadores clave" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Contactos esta semana"
          value={formatInt(summary.contactsThisWeek)}
          testId="kpi-contacts"
          aside={
            <SparkBars
              values={contacts}
              label="Empresas contactadas por semana, últimas 12 semanas"
            />
          }
        >
          {delta ? (
            <p
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                delta.tone === 'up' && 'text-success',
                delta.tone === 'down' && 'text-destructive',
                delta.tone === 'flat' && 'text-muted-foreground',
              )}
            >
              {delta.tone === 'up' && <TrendingUp className="size-3.5" aria-hidden="true" />}
              {delta.tone === 'down' && <TrendingDown className="size-3.5" aria-hidden="true" />}
              {delta.text}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Empresas distintas contactadas</p>
          )}
        </Tile>
        <Tile
          label="Cumplimiento de cuota semanal"
          value={formatPct(compliance)}
          testId="kpi-compliance"
        >
          <Meter
            value={compliance ?? 0}
            max={100}
            complete={typeof compliance === 'number' && compliance >= 100}
            label="Cumplimiento de cuota semanal"
            valueText={formatPct(compliance)}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatInt(summary.contactsThisWeek)} de {formatInt(weeklyQuota.target)} contactos
            {over && <span className="ml-1 font-medium text-success">· Meta superada</span>}
          </p>
        </Tile>
        <Tile
          label="Citas esta semana"
          value={formatInt(summary.appointmentsThisWeek)}
          testId="kpi-appointments"
        >
          <p className="text-xs text-muted-foreground">
            Semana del {formatDayMonth(summary.week.start)} al {formatDayMonth(summary.week.end)}
          </p>
        </Tile>
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
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          size="sm"
          label="Empresas"
          value={formatInt(companies.total)}
          testId="kpi-companies"
        />
        <Tile
          size="sm"
          label="En pipeline"
          value={formatInt(companies.inPipeline)}
          testId="kpi-pipeline"
        >
          <p className="text-xs text-muted-foreground">Ya salieron de “Por contactar”</p>
        </Tile>
        <Tile
          size="sm"
          label="Tasa de conversión"
          value={formatPct(conversion.ratePct)}
          testId="kpi-conversion"
        >
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatInt(conversion.contracted)} con contrato de {formatInt(conversion.contacted)}{' '}
            contactadas
          </p>
        </Tile>
      </div>
    </section>
  );
}
