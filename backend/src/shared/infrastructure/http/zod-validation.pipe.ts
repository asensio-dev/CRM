import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError } from '../../domain';

/**
 * Valida body/query/params con los esquemas de @axiom/contracts (los mismos que usa el frontend).
 * Uso: `@Body(new ZodValidationPipe(CreateCompanySchema)) dto: CreateCompanyDto`
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw DomainError.validation(
        'INVALID_INPUT',
        'Datos de entrada inválidos',
        parsed.error.issues,
      );
    }
    return parsed.data;
  }
}
