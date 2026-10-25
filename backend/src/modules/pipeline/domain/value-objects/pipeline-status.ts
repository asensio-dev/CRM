import {
  PIPELINE_STATUSES,
  PIPELINE_STATUSES_REQUIRING_NOTE,
  type PipelineStatus as PipelineStatusCode,
  type UserRole,
} from '@axiom/contracts';
import { DomainError, ValueObject } from '../../../../shared/domain';

export type { PipelineStatusCode };

/** Roles que pueden reactivar una empresa descartada (DESCARTADO → POR_CONTACTAR). */
export const REACTIVATION_ROLES: readonly UserRole[] = ['ADMIN', 'SUPERVISOR'];

/**
 * Patrón State: cada estado del pipeline conoce sus transiciones salientes.
 *
 *   POR_CONTACTAR       → CONTACTADO
 *   CONTACTADO          → SIN_RESPUESTA | CON_RESPUESTA
 *   SIN_RESPUESTA       → CONTACTADO (reintento)
 *   CON_RESPUESTA       → AGENDANDO_CITA | SIN_RESPUESTA
 *   AGENDANDO_CITA      → EN_PROCESO_CONTRATO | CON_RESPUESTA
 *   EN_PROCESO_CONTRATO → CONTRATO_ACTIVO | AGENDANDO_CITA
 *   CONTRATO_ACTIVO     → (terminal)
 *   cualquier no terminal → DESCARTADO (con nota)
 *   DESCARTADO          → POR_CONTACTAR (reactivación, solo ADMIN / SUPERVISOR)
 */
abstract class PipelineState {
  abstract readonly code: PipelineStatusCode;
  /** Transiciones propias del estado (sin contar DESCARTADO). */
  protected abstract readonly next: readonly PipelineStatusCode[];

  /** Un estado terminal no admite ninguna salida, ni siquiera a DESCARTADO. */
  get isTerminal(): boolean {
    return false;
  }

  /** Destinos permitidos para el rol indicado, en orden estable. */
  targetsFor(_role: UserRole): PipelineStatusCode[] {
    return this.isTerminal ? [] : [...this.next, 'DESCARTADO'];
  }
}

class PorContactar extends PipelineState {
  readonly code = 'POR_CONTACTAR' as const;
  protected readonly next = ['CONTACTADO'] as const;
}

class Contactado extends PipelineState {
  readonly code = 'CONTACTADO' as const;
  protected readonly next = ['SIN_RESPUESTA', 'CON_RESPUESTA'] as const;
}

class SinRespuesta extends PipelineState {
  readonly code = 'SIN_RESPUESTA' as const;
  protected readonly next = ['CONTACTADO'] as const;
}

class ConRespuesta extends PipelineState {
  readonly code = 'CON_RESPUESTA' as const;
  protected readonly next = ['AGENDANDO_CITA', 'SIN_RESPUESTA'] as const;
}

class AgendandoCita extends PipelineState {
  readonly code = 'AGENDANDO_CITA' as const;
  protected readonly next = ['EN_PROCESO_CONTRATO', 'CON_RESPUESTA'] as const;
}

class EnProcesoContrato extends PipelineState {
  readonly code = 'EN_PROCESO_CONTRATO' as const;
  protected readonly next = ['CONTRATO_ACTIVO', 'AGENDANDO_CITA'] as const;
}

class ContratoActivo extends PipelineState {
  readonly code = 'CONTRATO_ACTIVO' as const;
  protected readonly next = [] as const;
  override get isTerminal(): boolean {
    return true;
  }
}

class Descartado extends PipelineState {
  readonly code = 'DESCARTADO' as const;
  protected readonly next = ['POR_CONTACTAR'] as const;
  /** Solo se sale de DESCARTADO reactivando, y solo con un rol privilegiado. */
  override targetsFor(role: UserRole): PipelineStatusCode[] {
    return REACTIVATION_ROLES.includes(role) ? [...this.next] : [];
  }
}

const STATES: Record<PipelineStatusCode, PipelineState> = {
  POR_CONTACTAR: new PorContactar(),
  CONTACTADO: new Contactado(),
  SIN_RESPUESTA: new SinRespuesta(),
  CON_RESPUESTA: new ConRespuesta(),
  AGENDANDO_CITA: new AgendandoCita(),
  EN_PROCESO_CONTRATO: new EnProcesoContrato(),
  CONTRATO_ACTIVO: new ContratoActivo(),
  DESCARTADO: new Descartado(),
};

const isStatusCode = (value: string): value is PipelineStatusCode =>
  (PIPELINE_STATUSES as readonly string[]).includes(value);

/** Value object del estado del pipeline. Delega las reglas de transición en su `PipelineState`. */
export class PipelineStatus extends ValueObject<{ value: PipelineStatusCode }> {
  static readonly INITIAL = new PipelineStatus({ value: 'POR_CONTACTAR' });

  static of(value: string): PipelineStatus {
    if (!isStatusCode(value)) {
      throw DomainError.validation('PIPELINE_UNKNOWN_STATUS', `Estado desconocido: ${value}`, {
        value,
        allowed: PIPELINE_STATUSES,
      });
    }
    return new PipelineStatus({ value });
  }

  get value(): PipelineStatusCode {
    return this.props.value;
  }

  private get state(): PipelineState {
    return STATES[this.props.value];
  }

  get isTerminal(): boolean {
    return this.state.isTerminal;
  }

  /** Estados a los que el rol puede mover la empresa desde aquí. */
  allowedTransitions(role: UserRole): PipelineStatusCode[] {
    return this.state.targetsFor(role);
  }

  canTransitionTo(to: PipelineStatusCode, role: UserRole): boolean {
    return this.allowedTransitions(role).includes(to);
  }

  /** Requiere nota (motivo) para llegar a `to`. */
  static requiresNote(to: PipelineStatusCode): boolean {
    return PIPELINE_STATUSES_REQUIRING_NOTE.includes(to);
  }

  /**
   * Valida la transición y devuelve el nuevo estado.
   * - Reactivar sin rol → FORBIDDEN `PIPELINE_REACTIVATION_FORBIDDEN`.
   * - Cualquier otra transición no listada → RULE `PIPELINE_INVALID_TRANSITION` {from, to, allowed}.
   */
  transitionTo(to: PipelineStatusCode, role: UserRole): PipelineStatus {
    const target = PipelineStatus.of(to);
    if (this.canTransitionTo(target.value, role)) return target;

    const from = this.value;
    const allowed = this.allowedTransitions(role);
    if (from === 'DESCARTADO' && to === 'POR_CONTACTAR') {
      throw new DomainError(
        'PIPELINE_REACTIVATION_FORBIDDEN',
        `Solo ${REACTIVATION_ROLES.join(' o ')} pueden reactivar una empresa descartada`,
        'FORBIDDEN',
        { from, to, allowed },
      );
    }
    throw new DomainError(
      'PIPELINE_INVALID_TRANSITION',
      `Transición no permitida: ${from} → ${to}`,
      'RULE',
      { from, to, allowed },
    );
  }

  override toString(): string {
    return this.props.value;
  }
}
