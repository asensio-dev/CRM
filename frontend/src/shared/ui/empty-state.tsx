import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      )}
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
