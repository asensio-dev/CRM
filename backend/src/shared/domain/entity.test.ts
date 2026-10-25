import { describe, expect, test } from 'bun:test';
import type { DomainEvent } from './domain-event';
import { AggregateRoot } from './entity';
import { ValueObject } from './value-object';

class Money extends ValueObject<{ amount: number; currency: string }> {
  static of(amount: number, currency: string) {
    return new Money({ amount, currency });
  }
}

class Order extends AggregateRoot {
  static create(id: number | null) {
    return new Order(id);
  }
  place() {
    this.record({ name: 'order.placed', occurredAt: new Date() } satisfies DomainEvent);
  }
}

describe('shared kernel', () => {
  test('value objects compare by value and are immutable', () => {
    const a = Money.of(10, 'NIO');
    expect(a.equals(Money.of(10, 'NIO'))).toBe(true);
    expect(a.equals(Money.of(11, 'NIO'))).toBe(false);
    expect(Object.isFrozen((a as unknown as { props: object }).props)).toBe(true);
  });

  test('entities compare by id; unsaved entities are never equal', () => {
    expect(Order.create(1).equals(Order.create(1))).toBe(true);
    expect(Order.create(null).equals(Order.create(null))).toBe(false);
  });

  test('aggregate roots release recorded events once', () => {
    const order = Order.create(1);
    order.place();
    expect(order.pullEvents().map((e) => e.name)).toEqual(['order.placed']);
    expect(order.pullEvents()).toEqual([]);
  });
});
