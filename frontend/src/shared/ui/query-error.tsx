import { AlertTriangle } from 'lucide-react';
import { errorMessage } from '../lib/api-errors';
import { Button } from './button';
import { EmptyState } from './empty-state';

/** Estado de error de una consulta, con botón para reintentar. */
export function QueryError({
  error,
  onRetry,
  title = 'No se pudieron cargar los datos',
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <div role="alert">
      <EmptyState
        icon={AlertTriangle}
        title={title}
        description={errorMessage(error, 'Inténtalo de nuevo en unos segundos.')}
        action={
          <Button variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    </div>
  );
}
