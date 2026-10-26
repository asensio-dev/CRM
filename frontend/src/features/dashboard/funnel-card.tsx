import type { FunnelDto } from '@axiom/contracts';
import { Filter } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { PIPELINE_STATUS_STYLES } from '@/shared/lib/pipeline-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatInt, formatPct, orderStages } from './format';

/** Embudo horizontal con pista fantasma: cada etapa ocupa su pista pálida a ancho completo. */
export function FunnelCard({ funnel }: { funnel: FunnelDto }) {
  const stages = orderStages(funnel.stages);
  const max = Math.max(...stages.map((s) => s.reached), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Embudo del pipeline</CardTitle>
        <CardDescription>
          Empresas que alcanzaron cada etapa en el período y conversión respecto a la etapa previa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {max === 0 ? (
          <EmptyState icon={Filter} title="Sin datos en el período" className="py-8" />
        ) : (
          <ol className="space-y-3.5" aria-label="Etapas del embudo">
            {stages.map((s) => {
              const style = PIPELINE_STATUS_STYLES[s.status];
              const width = max > 0 ? (s.reached / max) * 100 : 0;
              return (
                <li key={s.status} data-stage={s.status} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{style.label}</span>
                    <span className="flex items-baseline gap-2 tabular-nums text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">
                          {formatInt(s.reached)}
                        </span>{' '}
                        alcanzaron · {formatInt(s.current)} ahora
                      </span>
                      {s.conversionPct !== null && (
                        <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                          {formatPct(s.conversionPct)} de la etapa previa
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${style.label}: ${formatInt(s.reached)} empresas`}
                    className="h-2.5 w-full overflow-hidden rounded-full bg-track"
                  >
                    <div
                      data-bar={s.status}
                      className={cn(
                        'h-full rounded-full transition-[width] duration-700 ease-out',
                        style.dot,
                      )}
                      style={{ width: `${Math.max(width, s.reached > 0 ? 1.5 : 0)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
