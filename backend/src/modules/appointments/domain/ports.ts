import type {
  AppointmentDto,
  AppointmentStatus,
  Paginated,
  PipelineStatus,
  UserRole,
} from '@axiom/contracts';
import type { Appointment } from './appointment';

/** Escritura: persiste agregados. `insert` asigna el id. */
export interface AppointmentRepository {
  findById(id: number): Promise<Appointment | null>;
  insert(appointment: Appointment): Promise<void>;
  /** Actualiza una cita PROGRAMADA (solo esas pueden cambiar). 0 filas → CONFLICT. */
  save(appointment: Appointment): Promise<void>;
}

export interface AppointmentListCriteria {
  userId?: number;
  companyId?: number;
  status?: AppointmentStatus;
  /** Inclusivo. */
  from?: Date;
  /** Exclusivo. */
  to?: Date;
  page: number;
  pageSize: number;
}

/** Lectura (CQRS ligero): modelos de lectura con el nombre de la empresa. */
export interface AppointmentReader {
  getById(id: number): Promise<AppointmentDto | null>;
  list(criteria: AppointmentListCriteria): Promise<Paginated<AppointmentDto>>;
  agenda(criteria: { userId: number | undefined; from: Date; to: Date }): Promise<AppointmentDto[]>;
}

export interface AdvanceCompanyInput {
  companyId: number;
  target: PipelineStatus;
  /** Si la empresa ya está en alguno de estos estados no se hace nada (no es error). */
  tolerated: readonly PipelineStatus[];
  actor: { userId: number; role: UserRole };
  note?: string;
}

/**
 * Puerto hacia el módulo pipeline (único que escribe `companies.status`).
 * `moved=false` significa que la empresa ya estaba en un estado tolerado.
 */
export interface CompanyPipelineGateway {
  advance(input: AdvanceCompanyInput): Promise<{ moved: boolean }>;
}

export const APPOINTMENT_REPOSITORY = Symbol('AppointmentRepository');
export const APPOINTMENT_READER = Symbol('AppointmentReader');
export const COMPANY_PIPELINE_GATEWAY = Symbol('AppointmentsCompanyPipelineGateway');
