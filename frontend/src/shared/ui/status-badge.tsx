import type { PipelineStatus } from '@axiom/contracts';
import { cn } from '../lib/cn';
import { PIPELINE_STATUS_STYLES } from '../lib/pipeline-status';
import { Badge } from './badge';

export function StatusBadge({ status, className }: { status: PipelineStatus; className?: string }) {
  const style = PIPELINE_STATUS_STYLES[status];
  return (
    <Badge variant="outline" className={cn(style.badge, className)} data-status={status}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </Badge>
  );
}
