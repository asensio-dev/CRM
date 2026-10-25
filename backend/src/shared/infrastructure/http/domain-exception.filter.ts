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

function prismaErrorInfo(exception: unknown): { name: string; code?: string } | null {
  if (!(exception instanceof Error) || !exception.name.startsWith('PrismaClient')) return null;
  const code = (exception as { code?: unknown }).code;
  return { name: exception.name, code: typeof code === 'string' ? code : undefined };
}

/**
 * Texto para el log de un error inesperado. Los errores de Prisma incluyen en su mensaje los
 * argumentos de la consulta (cédulas, teléfonos, nombres…): de ellos solo se registra tipo, código
 * y pila, nunca el mensaje.
 */
export function safeErrorLog(exception: unknown): string {
  const prisma = prismaErrorInfo(exception);
  if (prisma && exception instanceof Error) {
    const frames = (exception.stack ?? '')
      .split('\n')
      .filter((line) => line.trimStart().startsWith('at '))
      .join('\n');
    return `${prisma.name}${prisma.code ? ` ${prisma.code}` : ''} (mensaje omitido: puede contener datos personales)\n${frames}`;
  }
  if (exception instanceof Error)
    return exception.stack ?? `${exception.name}: ${exception.message}`;
  return `Excepción no Error: ${typeof exception}`;
}

function httpClientError(exception: unknown): ApiError | null {
  if (!(exception instanceof Error)) return null;
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  if (typeof status !== 'number' || status < 400 || status > 499 || expose !== true) return null;
  return {
    statusCode: status,
    code: HttpStatus[status] ?? 'BAD_REQUEST',
    message: status === 413 ? 'El cuerpo de la petición es demasiado grande' : 'Petición inválida',
  };
}

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
    // Errores 4xx de middlewares Express (body-parser: JSON mal formado, cuerpo > 100 KB…): siguen
    // la convención http-errors (`status` + `expose`). Antes acababan como 500.
    const clientError = httpClientError(exception);
    if (clientError) return clientError;
    const prisma = prismaErrorInfo(exception);
    // Carreras contra índices únicos / filas borradas entre lectura y escritura: no son un 500.
    if (prisma?.code === 'P2002') {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'UNIQUE_CONSTRAINT',
        message: 'El registro ya existe',
      };
    }
    if (prisma?.code === 'P2025') {
      return { statusCode: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'No encontrado' };
    }
    this.logger.error(safeErrorLog(exception));
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    };
  }
}
