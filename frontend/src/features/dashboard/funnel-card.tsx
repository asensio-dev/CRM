import type { FunnelDto, FunnelStageDto } from '@axiom/contracts';
import { Filter } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatInt, formatPct, orderStages } from './format';

function StageRow({ stage, max }: { stage: FunnelStageDto; max: number }) {
  const style = PIPELINE_STATUS_STYLES[stage.status];
  const width = max > 0 ? (stage.current / max) * 100 : 0;
  return (
    <li
      data-stage={stage.status}
      className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_5rem_6rem_7rem]"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', style.dot)} />
        {style.label}
      </span>
      <span className="text-right text-sm font-semibold tabular-nums sm:order-last sm:hidden">
        {formatInt(stage.current)}
      </span>
      <div
        role="img"
        aria-label={`${style.label}: ${formatInt(stage.current)} empresas ahora`}
        className="col-span-2 h-2 overflow-hidden rounded-full bg-track sm:col-span-1"
      >
        <div
          data-bar={stage.status}
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', style.dot)}
          style={{ width: `${Math.max(width, stage.current > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      <span className="hidden text-right text-sm font-semibold tabular-nums sm:block">
        {formatInt(stage.current)}
      </span>
      <span className="col-span-2 text-xs text-muted-foreground tabular-nums sm:col-span-1 sm:text-right sm:text-sm">
        <span className="sm:hidden">En el período: </span>
        {formatInt(stage.reached)}
      </span>
      <span className="hidden text-right sm:block">
        {stage.conversionPct !== null ? (
          <span className="whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium tabular-nums text-accent-foreground">
            {formatPct(stage.conversionPct)}
            <span className="sr-only"> de la etapa previa</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </span>
    </li>
  );
}

/**
 * Embudo legible: el pool ("Por contactar") se resume en una línea porque su tamaño aplasta a
 * las demás barras; las etapas de trabajo se comparan entre sí y "Descartado" va aparte.
 */
export function FunnelCard({ funnel }: { funnel: FunnelDto }) {
  const stages = orderStages(funnel.stages);
  const reachedMax = Math.max(...stages.map((s) => s.reached), 0);
  const pool = stages.find((s) => s.status === 'POR_CONTACTAR');
  const working = stages.filter((s) => s.status !== 'POR_CONTACTAR' && s.status !== 'DESCARTADO');
  const discarded = stages.find((s) => s.status === 'DESCARTADO');
  const max = Math.max(...working.map((s) => s.current), discarded?.current ?? 0, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embudo del pipeline</CardTitle>
        <CardDescription>
          Cuántas empresas hay en cada etapa ahora, cuántas llegaron en el período y qué parte
          avanzó desde la etapa anterior.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {reachedMax === 0 ? (
          <EmptyState icon={Filter} title="Sin datos en el período" className="py-8" />
        ) : (
          <>
            {pool && (
              <p
                data-stage="POR_CONTACTAR"
                className="mb-4 flex flex-wrap items-baseline gap-x-2 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground"
              >
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatInt(pool.current)}
                </span>
                empresas siguen por contactar, de {formatInt(pool.reached)} en total.
              </p>
            )}
            <div
              aria-hidden="true"
              className="hidden grid-cols-[11rem_minmax(0,1fr)_5rem_6rem_7rem] gap-x-4 border-b pb-2 text-xs font-medium text-muted-foreground sm:grid"
            >
              <span>Etapa</span>
              <span />
              <span className="text-right">Ahora</span>
              <span className="text-right">En el período</span>
              <span className="text-right" title="Porcentaje respecto a la etapa anterior">
                Conversión
              </span>
            </div>
            <ol className="divide-y" aria-label="Etapas del embudo">
              {working.map((s) => (
                <StageRow key={s.status} stage={s} max={max} />
              ))}
            </ol>
            {discarded && (
              <ol className="mt-3 border-t border-dashed pt-1" aria-label="Fuera del embudo">
                <StageRow stage={discarded} max={max} />
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
