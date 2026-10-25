import type { AppointmentDto, AppointmentMode, AppointmentStatus } from '@axiom/contracts';
import { Appointment } from '../../domain';

export interface AppointmentRow {
  id: number;
  companyId: number;
  userId: number;
  scheduledAt: Date;
  mode: string;
  location: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toAggregate = (row: AppointmentRow): Appointment =>
  Appointment.rehydrate(row.id, {
    companyId: row.companyId,
    userId: row.userId,
    scheduledAt: row.scheduledAt,
    mode: row.mode as AppointmentMode,
    location: row.location,
    status: row.status as AppointmentStatus,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const toDto = (
  row: AppointmentRow,
  company: { legalName: string } | null,
): AppointmentDto => ({
  id: row.id,
  companyId: row.companyId,
  companyName: company?.legalName ?? null,
  userId: row.userId,
  scheduledAt: row.scheduledAt.toISOString(),
  mode: row.mode as AppointmentMode,
  location: row.location,
  status: row.status as AppointmentStatus,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
