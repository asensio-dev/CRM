import { normalizePhone } from '@axiom/contracts';
import { DomainError } from '../../../shared/domain';

/** Invariantes de campos compartidas por Company y CompanyBranch. */

export function requiredText(value: string | undefined | null, field: string, max: number): string {
  const text = value?.trim() ?? '';
  if (text.length === 0) {
    throw DomainError.validation('COMPANY_FIELD_REQUIRED', `${field} es obligatorio`);
  }
  if (text.length > max) {
    throw DomainError.validation('COMPANY_FIELD_TOO_LONG', `${field} excede ${max} caracteres`);
  }
  return text;
}

/** Texto opcional: vacío o null → null. */
export function optionalText(
  value: string | undefined | null,
  field: string,
  max: number,
): string | null {
  const text = value?.trim() ?? '';
  if (text.length === 0) return null;
  if (text.length > max) {
    throw DomainError.validation('COMPANY_FIELD_TOO_LONG', `${field} excede ${max} caracteres`);
  }
  return text;
}

export function employeeCountOf(value: number | undefined): number {
  const count = value ?? 0;
  if (!Number.isInteger(count) || count < 0) {
    throw DomainError.validation(
      'COMPANY_EMPLOYEE_COUNT_INVALID',
      'La cantidad de empleados debe ser un entero mayor o igual a 0',
    );
  }
  return count;
}

/** Teléfono normalizado; vacío → null; implausible → error de validación. */
export function phoneOf(value: string | undefined | null): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const phone = normalizePhone(value);
  if (!phone) throw DomainError.validation('COMPANY_PHONE_INVALID', 'El teléfono es inválido');
  return phone;
}
