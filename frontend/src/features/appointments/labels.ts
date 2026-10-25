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

/** Estilos de badge por estado de cita (mismo patrón que los estados del pipeline). */
export const APPOINTMENT_STATUS_BADGE: Record<AppointmentStatus, string> = {
  PROGRAMADA:
    'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  REALIZADA:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  CANCELADA:
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  REPROGRAMADA:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
};
