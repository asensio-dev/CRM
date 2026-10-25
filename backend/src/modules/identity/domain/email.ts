import { DomainError, ValueObject } from '../../../shared/domain';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email extends ValueObject<{ value: string }> {
  private constructor(value: string) {
    super({ value });
  }

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (value.length > 150 || !EMAIL_RE.test(value)) {
      throw DomainError.validation('INVALID_EMAIL', 'Correo electrónico inválido');
    }
    return new Email(value);
  }

  get value(): string {
    return this.props.value;
  }
}
