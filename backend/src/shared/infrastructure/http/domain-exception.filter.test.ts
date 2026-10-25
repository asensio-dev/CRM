import { describe, expect, test } from 'bun:test';
import { type ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { DomainError } from '../../domain';
import { DomainExceptionFilter, safeErrorLog } from './domain-exception.filter';

const PII = 'Juan Pérez 001-010190-0001A';

function prismaError(code: string) {
  const error = new Error(
    `Invalid \`prisma.company.update()\` invocation: { legalRepIdNumber: "${PII}" }`,
  );
  error.name = 'PrismaClientKnownRequestError';
  return Object.assign(error, { code });
}

function run(exception: unknown) {
  const filter = new DomainExceptionFilter();
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      body = payload;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  const logged: string[] = [];
  const original = Logger.prototype.error;
  Logger.prototype.error = (message: unknown) => {
    logged.push(String(message));
  };
  try {
    filter.catch(exception, host);
  } finally {
    Logger.prototype.error = original;
  }
  return { status, body, logged };
}

describe('DomainExceptionFilter', () => {
  test('DomainError y HttpException conservan su forma', () => {
    expect(run(DomainError.notFound('X', 'no')).status).toBe(404);
    expect(run(new NotFoundException('nada')).body.code).toBe('NOT_FOUND');
  });

  test('500 genérico; el log de un error de Prisma no incluye su mensaje (datos personales)', () => {
    const { status, body, logged } = run(prismaError('P2034'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(PII);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('PrismaClientKnownRequestError P2034');
    expect(logged[0]).not.toContain(PII);
  });

  test('P2002 (único) → 409 y P2025 (no existe) → 404, sin detalles', () => {
    const conflict = run(prismaError('P2002'));
    expect(conflict.status).toBe(409);
    expect(JSON.stringify(conflict.body)).not.toContain(PII);
    expect(run(prismaError('P2025')).status).toBe(404);
  });

  test('errores 4xx de body-parser (JSON roto, cuerpo grande) no son 500', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });
    const big = run(tooLarge);
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(big.logged).toHaveLength(0);
    const broken = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      expose: true,
    });
    expect(run(broken).status).toBe(400);
    // Un error con status pero no "expose" sigue siendo 500 genérico
    expect(run(Object.assign(new Error('x'), { status: 400 })).status).toBe(500);
  });

  test('safeErrorLog de errores normales conserva la pila', () => {
    expect(safeErrorLog(new Error('boom'))).toContain('boom');
    expect(safeErrorLog('texto')).toBe('Excepción no Error: string');
  });
});
