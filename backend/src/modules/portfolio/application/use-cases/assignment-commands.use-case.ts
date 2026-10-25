import type {
  AssignmentChangeResultDto,
  BulkAssignCommand,
  ReleaseReason,
  UserRole,
} from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/application';
import {
  ASSIGNMENT_REPOSITORY,
  type AssignmentRepository,
  assignmentNotFound,
  COMPANY_LOOKUP,
  type CompanyLookup,
  EXECUTIVE_DIRECTORY,
  type ExecutiveDirectory,
  POOL_READER,
  type PoolReader,
  PortfolioAssignment,
  targetNotExecutive,
  userNotFound,
} from '../../domain';
import { assertSupervisor, RotationContext } from '../services/rotation-context';

interface Actor {
  userId: number;
  role: UserRole;
}

const OUT_OF_ROTATION = new Set(['CONTRATO_ACTIVO', 'DESCARTADO']);

/** Valida que el destino sea un EJECUTIVO activo. */
async function assertExecutive(directory: ExecutiveDirectory, userId: number): Promise<void> {
  const user = await directory.findById(userId);
  if (!user) throw userNotFound(userId);
  if (user.role !== 'EJECUTIVO' || !user.isActive) throw targetNotExecutive(userId);
}

/**
 * Reasignación manual (ADMIN/SUPERVISOR): las empresas pasan a la cartera de `toUserId`.
 * La asignación previa (si es de otro) se libera con REASIGNACION_MANUAL. Se permiten empresas
 * sin teléfono (decisión humana), pero no las que están fuera de rotación.
 */
@Injectable()
export class ReassignCompaniesUseCase {
  constructor(
    private readonly context: RotationContext,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(EXECUTIVE_DIRECTORY) private readonly directory: ExecutiveDirectory,
    @Inject(COMPANY_LOOKUP) private readonly companies: CompanyLookup,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: {
    companyIds: number[];
    toUserId: number;
    actor: Actor;
  }): Promise<AssignmentChangeResultDto> {
    assertSupervisor(input.actor.role);
    await assertExecutive(this.directory, input.toUserId);
    const { cycle, now } = await this.context.requireOpenCycle();
    const ids = [...new Set(input.companyIds)];
    const result: AssignmentChangeResultDto = { assigned: [], released: [], skipped: [] };

    await this.uow.run(async () => {
      const statuses = await this.companies.statuses(ids);
      const current = new Map(
        (await this.assignments.findActiveByCompanyIds(ids)).map((a) => [a.companyId, a]),
      );
      const changed: PortfolioAssignment[] = [];
      for (const companyId of ids) {
        const status = statuses.get(companyId);
        const existing = current.get(companyId);
        if (!status || OUT_OF_ROTATION.has(status) || existing?.userId === input.toUserId) {
          result.skipped.push(companyId);
          continue;
        }
        if (existing) {
          existing.release('REASIGNACION_MANUAL', now);
          changed.push(existing);
          result.released.push(existing.id as number);
        }
        changed.push(
          PortfolioAssignment.assign({
            companyId,
            userId: input.toUserId,
            cycleId: cycle.id as number,
            at: now,
          }),
        );
        result.assigned.push(companyId);
      }
      await this.assignments.saveAll(changed);
    });
    return result;
  }
}

/** Asignación masiva desde el pool por filtros (sector/actividad/empleados), más empleados primero. */
@Injectable()
export class BulkAssignCompaniesUseCase {
  constructor(
    private readonly context: RotationContext,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(EXECUTIVE_DIRECTORY) private readonly directory: ExecutiveDirectory,
    @Inject(POOL_READER) private readonly pool: PoolReader,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: BulkAssignCommand & { actor: Actor }): Promise<AssignmentChangeResultDto> {
    assertSupervisor(input.actor.role);
    await assertExecutive(this.directory, input.toUserId);
    const { cycle, now } = await this.context.requireOpenCycle();
    return this.uow.run(async () => {
      const candidates = await this.pool.findByFilters(input.filters, input.limit);
      const fresh = candidates.slice(0, input.limit).map((c) =>
        PortfolioAssignment.assign({
          companyId: c.companyId,
          userId: input.toUserId,
          cycleId: cycle.id as number,
          at: now,
        }),
      );
      await this.assignments.saveAll(fresh);
      return { assigned: fresh.map((a) => a.companyId), released: [], skipped: [] };
    });
  }
}

/** Devuelve una empresa al pool manualmente. */
@Injectable()
export class ReleaseAssignmentUseCase {
  constructor(
    private readonly context: RotationContext,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: {
    assignmentId: number;
    reason?: ReleaseReason;
    actor: Actor;
  }): Promise<AssignmentChangeResultDto> {
    assertSupervisor(input.actor.role);
    const { now } = await this.context.snapshot();
    return this.uow.run(async () => {
      const assignment = await this.assignments.findById(input.assignmentId);
      if (!assignment) throw assignmentNotFound(input.assignmentId);
      assignment.release(input.reason ?? 'REASIGNACION_MANUAL', now);
      await this.assignments.saveAll([assignment]);
      return { assigned: [], released: [input.assignmentId], skipped: [] };
    });
  }
}
