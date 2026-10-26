import type { ExecutiveCoverageDto, WeekInfoDto } from '@axiom/contracts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Card } from '@/shared/ui/card';
import { Meter } from '@/shared/ui/meter';
import { cycleDays, formatDayRange, formatLocalRange, percent } from './format';

const nf = new Intl.NumberFormat('es-NI');

/**
 * Tira de "pista fantasma" del ciclo: una columna por día sobre una pista pálida de altura
 * completa; los días transcurridos se rellenan con el degradado vertical y hoy queda marcado.
 */
export function CycleStrip({
  week,
  today = new Date(),
}: {
  week: WeekInfoDto;
  /** Inyectable en tests. */
  today?: Date;
}) {
  const days = cycleDays(week.cycle.startDate, week.totalWeeks, today);
  const total = days.length;
  const todayDay = days.find((d) => d.state === 'today');
  const elapsed = days.filter((d) => d.state !== 'future').length;
  const dayFraction = (today.getHours() * 60 + today.getMinutes()) / (24 * 60);
  const weeks = Array.from({ length: week.totalWeeks }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const summary = todayDay
    ? `Día ${todayDay.index + 1} de ${total} del ciclo`
    : elapsed === 0
      ? 'El ciclo aún no empieza'
      : 'El ciclo ya terminó';

  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={summary}
        className="grid gap-2.5 sm:gap-4"
        style={{ gridTemplateColumns: `repeat(${week.totalWeeks}, minmax(0, 1fr))` }}
      >
        {weeks.map((wDays, wi) => {
          const n = wi + 1;
          const first = wDays[0];
          const last = wDays[wDays.length - 1];
          const current = n === week.weekNumber;
          return (
            <div key={n} className="grid min-w-0 gap-2">
              <div className="flex h-20 items-stretch gap-[3px] sm:gap-1">
                {wDays.map((d) => (
                  <div
                    key={d.index}
                    data-testid="cycle-day"
                    data-state={d.state}
                    title={format(d.date, "EEEE d 'de' MMMM", { locale: es })}
                    className={cn(
                      'relative flex-1 overflow-hidden rounded-[5px] bg-track',
                      d.state === 'today' && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
                    )}
                  >
                    {d.state !== 'future' && (
                      <div
                        className="absolute inset-x-0 bottom-0 bg-fill-fade-y"
                        style={{
                          height:
                            d.state === 'past' ? '100%' : `${Math.max(18, dayFraction * 100)}%`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span
                  className={cn(
                    'font-medium',
                    current ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Semana {n}
                </span>
                {first && last && (
                  <span className="tabular-nums text-muted-foreground">
                    {formatDayRange(first.date, last.date)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Panel del ciclo activo: número, semana k de N, fechas y la tira de 21 días. */
export function CyclePanel({ week, today = new Date() }: { week: WeekInfoDto; today?: Date }) {
  const days = cycleDays(week.cycle.startDate, week.totalWeeks, today);
  const todayDay = days.find((d) => d.state === 'today');
  const remaining = todayDay ? days.length - todayDay.index - 1 : null;
  return (
    <Card className="grid gap-6 p-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-center lg:gap-10">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Ciclo #{week.cycle.number}</h2>
        <p className="font-medium">
          Semana {week.weekNumber} de {week.totalWeeks}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatLocalRange(week.cycle.startDate, week.cycle.endDate)}
        </p>
        {todayDay && remaining !== null && (
          <p className="mt-2 text-sm text-muted-foreground tabular-nums">
            Día {todayDay.index + 1} de {days.length} ·{' '}
            {remaining === 0
              ? 'último día'
              : `${remaining} ${remaining === 1 ? 'día restante' : 'días restantes'}`}
          </p>
        )}
      </div>
      <CycleStrip week={week} today={today} />
    </Card>
  );
}

function StatTile({
  id,
  label,
  value,
  children,
}: {
  id: string;
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="grid content-start gap-1.5 p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        data-testid={`stat-${id}`}
        className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] tabular-nums"
      >
        {value}
      </p>
      {children && <div className="mt-1.5 text-xs text-muted-foreground">{children}</div>}
    </Card>
  );
}

/** Totales de la cartera del ciclo, derivados de la cobertura por ejecutivo que ya da el API. */
export function PortfolioStats({
  executives,
  showExecutiveCount,
}: {
  executives: readonly ExecutiveCoverageDto[];
  /** Oculta el total de ejecutivos (un ejecutivo solo se ve a sí mismo). */
  showExecutiveCount: boolean;
}) {
  const assigned = executives.reduce((s, e) => s + e.assigned, 0);
  const target = executives.reduce((s, e) => s + e.target, 0);
  const contacted = executives.reduce((s, e) => s + Math.min(e.contactedThisCycle, e.assigned), 0);
  const withPlan = executives.filter((e) => e.plan).length;
  const coverage = percent(contacted, assigned);
  const untouched = Math.max(0, assigned - contacted);

  return (
    <section
      aria-label="Resumen de la cartera"
      data-testid="portfolio-stats"
      className={cn(
        'grid gap-4 sm:grid-cols-2',
        showExecutiveCount ? 'xl:grid-cols-4' : 'xl:grid-cols-3',
      )}
    >
      <StatTile id="assigned" label="Cartera total" value={nf.format(assigned)}>
        Meta de <span className="tabular-nums">{nf.format(target)}</span> empresas
      </StatTile>
      {showExecutiveCount && (
        <StatTile id="executives" label="Ejecutivos" value={nf.format(executives.length)}>
          <span className="tabular-nums">{nf.format(withPlan)}</span> con plan esta semana
        </StatTile>
      )}
      <StatTile id="coverage" label="Cobertura del ciclo" value={`${coverage}%`}>
        <Meter
          size="sm"
          value={contacted}
          max={assigned}
          label="Cobertura total del ciclo"
          complete={assigned > 0 && contacted >= assigned}
        />
        <p className="mt-2 tabular-nums">
          {nf.format(contacted)} de {nf.format(assigned)} con interacción
        </p>
      </StatTile>
      <StatTile id="untouched" label="Sin contacto en el ciclo" value={nf.format(untouched)}>
        Empresas de la cartera aún sin interacción
      </StatTile>
    </section>
  );
}
