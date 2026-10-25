import { PIPELINE_STATUSES, type PipelineStatus } from '@axiom/contracts';
import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';
import { Badge } from '@/shared/ui/badge';
import { StatusBadge } from '@/shared/ui/status-badge';

/** Los DTO de cartera traen `status: string`; tolera valores desconocidos sin romper la pantalla. */
export function AnyStatusBadge({ status }: { status: string }) {
  if ((PIPELINE_STATUSES as readonly string[]).includes(status)) {
    return <StatusBadge status={status as PipelineStatus} />;
  }
  return <Badge variant="outline">{status}</Badge>;
}

/** "hace 3 días" con la fecha exacta como tooltip, o "Sin contacto". */
export function LastContact({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">Sin contacto</span>;
  return (
    <time dateTime={iso} title={formatAbsolute(iso)}>
      {formatRelative(iso)}
    </time>
  );
}
