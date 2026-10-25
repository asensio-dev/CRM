import type { ApiError } from '@axiom/contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, type DomainErrorKind } from '../../domain';

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  RULE: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Traduce cualquier error a la forma única `ApiError`. Los errores inesperados no filtran detalles. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toApiError(exception);
    res.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof DomainError) {
      return {
        statusCode: STATUS_BY_KIND[exception.kind],
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return {
        statusCode: exception.getStatus(),
        code: HttpStatus[exception.getStatus()] ?? 'HTTP_ERROR',
        message: typeof response === 'string' ? response : exception.message,
        details: typeof response === 'object' ? response : undefined,
      };
    }
    this.logger.error(exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    };
  }
}
