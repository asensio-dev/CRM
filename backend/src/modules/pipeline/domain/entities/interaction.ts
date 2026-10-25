import type { InteractionChannel, InteractionOutcome } from '@axiom/contracts';
import { DomainError, Entity } from '../../../../shared/domain';

/** Margen para relojes desincronizados al registrar una interacción "ahora". */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;
export const MAX_INTERACTION_NOTES = 2000;

export interface InteractionProps {
  companyId: number;
  userId: number;
  channel: InteractionChannel;
  outcome: InteractionOutcome;
  notes: string | null;
  occurredAt: Date;
  nextFollowUpAt: Date | null;
  planItemId: number | null;
}

/** Registro de un contacto (llamada, WhatsApp, correo, visita…). Inmutable una vez creado. */
export class Interaction extends Entity {
  private constructor(
    id: number | null,
    readonly props: Readonly<InteractionProps>,
  ) {
    super(id);
  }

  static create(props: InteractionProps, now: Date): Interaction {
    if (props.occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      throw DomainError.validation(
        'INTERACTION_IN_FUTURE',
        'La interacción no puede tener fecha futura',
      );
    }
    if (props.nextFollowUpAt && props.nextFollowUpAt.getTime() < props.occurredAt.getTime()) {
      throw DomainError.validation(
        'INTERACTION_FOLLOW_UP_BEFORE_CONTACT',
        'El próximo seguimiento debe ser posterior a la interacción',
      );
    }
    const notes = props.notes?.trim() || null;
    if (notes && notes.length > MAX_INTERACTION_NOTES) {
      throw DomainError.validation('INTERACTION_NOTES_TOO_LONG', 'Notas demasiado largas');
    }
    return new Interaction(null, Object.freeze({ ...props, notes }));
  }
}
