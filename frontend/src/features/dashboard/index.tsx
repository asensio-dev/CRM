import { lazy, Suspense } from 'react';
import { Skeleton } from '@/shared/ui/skeleton';

/** Recharts pesa bastante: la página se carga bajo demanda (chunk propio). */
const LazyDashboardPage = lazy(() =>
  import('./dashboard-page').then((m) => ({ default: m.DashboardPage })),
);

export function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-busy="true" aria-label="Cargando tablero" className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      <LazyDashboardPage />
    </Suspense>
  );
}

export { analyticsKeys } from './queries';
