import type { DomainEvent } from '../domain';

/** Un caso de uso = una operación de negocio con una única responsabilidad. */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

/** Ejecuta `work` en una transacción; todos los repositorios usados dentro comparten la transacción. */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface EventBus {
  publishAll(events: DomainEvent[]): Promise<void>;
}

export interface Clock {
  now(): Date;
}

/** Tokens de inyección de los puertos compartidos (Nest los resuelve al adaptador). */
export const UNIT_OF_WORK = Symbol('UnitOfWork');
export const EVENT_BUS = Symbol('EventBus');
export const CLOCK = Symbol('Clock');
