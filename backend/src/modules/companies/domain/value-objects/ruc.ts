import { normalizeRuc } from '@axiom/contracts';
import { DomainError, ValueObject } from '../../../../shared/domain';

/** RUC normalizado (texto en mayúsculas, sin espacios ni guiones, máx. 20 caracteres). */
export class Ruc extends ValueObject<{ value: string }> {
  private constructor(value: string) {
    super({ value });
  }

  static create(raw: unknown): Ruc {
    const value = normalizeRuc(raw);
    if (!value) throw DomainError.validation('COMPANY_RUC_INVALID', 'El RUC es inválido');
    return new Ruc(value);
  }

  get value(): string {
    return this.props.value;
  }

  override toString(): string {
    return this.props.value;
  }
}
