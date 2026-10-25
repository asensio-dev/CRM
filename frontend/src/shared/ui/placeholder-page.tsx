import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  wave: 2 | 3;
}

export function PlaceholderPage({ title, description, icon, wave }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`Disponible en la Ola ${wave}`}
        description="Esta sección se habilitará en una próxima entrega del proyecto."
      />
    </>
  );
}
