import { Building2 } from 'lucide-react';
import { PlaceholderPage } from '@/shared/ui/placeholder-page';

/** Ficha de empresa (pendiente: Ola 2, T2.5 — estado, timeline y registro de contactos). */
export function CompanyDetailPage() {
  return (
    <PlaceholderPage
      title="Ficha de empresa"
      description="Datos, sucursales, estado del pipeline e historial de contactos."
      icon={Building2}
      wave={2}
    />
  );
}
