import type { AppointmentMode, AppointmentStatus } from '@axiom/contracts';
import { type LucideIcon, MapPin, Phone, Video } from 'lucide-react';

export const MODE_LABELS: Record<AppointmentMode, string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  TELEFONICA: 'Telefónica',
};

export const MODE_ICONS: Record<AppointmentMode, LucideIcon> = {
  PRESENCIAL: MapPin,
  VIRTUAL: Video,
  TELEFONICA: Phone,
};

/** Estilos de badge por estado de cita, sobre los tokens del sistema (claro y oscuro). */
export const APPOINTMENT_STATUS_BADGE: Record<AppointmentStatus, string> = {
  PROGRAMADA: 'border-primary/20 bg-accent text-accent-foreground',
  REALIZADA: 'border-success/25 bg-success/10 text-success',
  CANCELADA: 'border-destructive/20 bg-destructive/10 text-destructive',
  REPROGRAMADA: 'border-warning/25 bg-warning/10 text-warning',
};
