import type { InteractionChannel, InteractionOutcome, UserRole } from '@axiom/contracts';
import { AggregateRoot, DomainError } from '../../../../shared/domain';
import { CompanyStatusChanged, InteractionRegistered } from '../events/pipeline-events';
import type { OutcomePolicy } from '../services/outcome-policy';
import { PipelineStatus, type PipelineStatusCode } from '../value-objects/pipeline-status';
import { Interaction } from './interaction';

export const MAX_STATUS_NOTE = 1000;

/** Quién ejecuta la operación (el rol decide transiciones restringidas). */
export interface Actor {
  userId: number;
  role: UserRole;
}

/** Fila pendiente de `status_history`. */
export interface StatusHistoryEntry {
  companyId: number;
  userId: number;
  fromStatus: PipelineStatusCode;
  toStatus: PipelineStatusCode;
  note: string | null;
  changedAt: Date;
}

export interface StatusTransition {
  from: PipelineStatusCode;
  to: PipelineStatusCode;
}

export interface RegisterInteractionInput {
  channel: InteractionChannel;
  outcome: InteractionOutcome;
  notes?: string | null;
  occurredAt: Date;
  nextFollowUpAt?: Date | null;
  planItemId?: number | null;
  /** Estado final explícito (se aplica después de la política automática). */
  targetStatus?: PipelineStatusCode | null;
  /** Nota del cambio explícito; por defecto, las notas de la interacción. */
  statusNote?: string | null;
}

export interface PipelineSnapshot {
  companyId: number;
  status: PipelineStatusCode;
  version: number;
  lastContactAt: Date | null;
}

/**
 * Agregado "pipeline de una empresa": la parte de `companies` que pertenece a este módulo
 * (status, version, lastContactAt) más sus historiales. `version` es la versión leída de la BD:
 * el repositorio la usa como condición del bloqueo optimista y la incrementa al guardar.
 */
export class CompanyPipeline extends AggregateRoot {
  private pendingHistory: StatusHistoryEntry[] = [];
  private pendingInteractions: Interaction[] = [];

  private constructor(
    companyId: number,
    private _status: PipelineStatus,
    private _version: number,
    private _lastContactAt: Date | null,
  ) {
    super(companyId);
  }

  static restore(snapshot: PipelineSnapshot): CompanyPipeline {
    return new CompanyPipeline(
      snapshot.companyId,
      PipelineStatus.of(snapshot.status),
      snapshot.version,
      snapshot.lastContactAt,
    );
  }

  get companyId(): number {
    return this._id as number;
  }
  get status(): PipelineStatus {
    return this._status;
  }
  get version(): number {
    return this._version;
  }
  get lastContactAt(): Date | null {
    return this._lastContactAt;
  }
  get hasChanges(): boolean {
    return this.pendingHistory.length > 0 || this.pendingInteractions.length > 0;
  }

  allowedNextStatuses(role: UserRole): PipelineStatusCode[] {
    return this._status.allowedTransitions(role);
  }

  /** Rechaza la operación si el cliente trabajaba sobre una versión anterior. */
  assertVersion(expected: number | undefined | null): void {
    if (expected === undefined || expected === null || expected === this._version) return;
    throw new DomainError(
      'PIPELINE_VERSION_MISMATCH',
      'La empresa fue modificada por otro usuario; recarga y vuelve a intentarlo',
      'CONFLICT',
      { expectedVersion: expected, currentVersion: this._version },
    );
  }

  /** Cambio de estado validado por la máquina de estados; deja historial y evento. */
  changeStatus(
    to: PipelineStatusCode,
    actor: Actor,
    note: string | null | undefined,
    at: Date,
  ): StatusTransition {
    const from = this._status.value;
    const { next, cleanNote } = CompanyPipeline.validateStep(this._status, to, actor, note);

    this._status = next;
    this.pendingHistory.push({
      companyId: this.companyId,
      userId: actor.userId,
      fromStatus: from,
      toStatus: to,
      note: cleanNote,
      changedAt: at,
    });
    this.record(new CompanyStatusChanged(this.companyId, from, to, actor.userId, at));
    return { from, to };
  }

  /**
   * Registra un contacto y aplica la política de resultados (Strategy):
   * primero las transiciones automáticas y luego, si se pidió, el estado explícito.
   * Siempre actualiza `lastContactAt` (sin retroceder si se registra un contacto pasado).
   */
  registerInteraction(
    input: RegisterInteractionInput,
    actor: Actor,
    policy: OutcomePolicy,
    now: Date,
  ): { interaction: Interaction; transitions: StatusTransition[] } {
    const interaction = Interaction.create(
      {
        companyId: this.companyId,
        userId: actor.userId,
        channel: input.channel,
        outcome: input.outcome,
        notes: input.notes ?? null,
        occurredAt: input.occurredAt,
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        planItemId: input.planItemId ?? null,
      },
      now,
    );

    // 1) pasos automáticos de la política, 2) estado explícito si difiere del resultado.
    const autoNote = `Automático: ${input.channel} / ${input.outcome}`;
    const plan = policy
      .automaticTransitions(this._status.value, input.outcome)
      .map((to) => ({ to, note: autoNote as string | null }));
    const reached = plan.at(-1)?.to ?? this._status.value;
    if (input.targetStatus && input.targetStatus !== reached) {
      plan.push({ to: input.targetStatus, note: input.statusNote ?? input.notes ?? null });
    }

    // Se valida el camino completo antes de mutar: o se aplica todo o nada.
    plan.reduce(
      (status, step) => CompanyPipeline.validateStep(status, step.to, actor, step.note).next,
      this._status,
    );
    const transitions = plan.map((step) => this.changeStatus(step.to, actor, step.note, now));

    if (!this._lastContactAt || this._lastContactAt.getTime() < input.occurredAt.getTime()) {
      this._lastContactAt = input.occurredAt;
    }
    this.pendingInteractions.push(interaction);
    this.record(
      new InteractionRegistered(
        this.companyId,
        actor.userId,
        input.channel,
        input.outcome,
        interaction.props.planItemId,
        input.occurredAt,
      ),
    );
    return { interaction, transitions };
  }

  /** Regla de un paso: transición válida para el rol + nota obligatoria / longitud máxima. */
  private static validateStep(
    from: PipelineStatus,
    to: PipelineStatusCode,
    actor: Actor,
    note: string | null | undefined,
  ): { next: PipelineStatus; cleanNote: string | null } {
    const next = from.transitionTo(to, actor.role);
    const cleanNote = note?.trim() || null;
    if (PipelineStatus.requiresNote(to) && !cleanNote) {
      throw DomainError.validation(
        'PIPELINE_NOTE_REQUIRED',
        `Pasar a ${to} requiere una nota con el motivo`,
        { from: from.value, to },
      );
    }
    if (cleanNote && cleanNote.length > MAX_STATUS_NOTE) {
      throw DomainError.validation('PIPELINE_NOTE_TOO_LONG', 'Nota demasiado larga');
    }
    return { next, cleanNote };
  }

  /** Historial e interacciones por insertar (los consume el repositorio al guardar). */
  pendingChanges(): { history: StatusHistoryEntry[]; interactions: Interaction[] } {
    return { history: [...this.pendingHistory], interactions: [...this.pendingInteractions] };
  }

  /** El repositorio lo llama tras persistir: nueva versión y cambios pendientes vaciados. */
  markPersisted(newVersion: number): void {
    this._version = newVersion;
    this.pendingHistory = [];
    this.pendingInteractions = [];
  }
}
