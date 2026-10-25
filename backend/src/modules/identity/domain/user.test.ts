import { describe, expect, test } from 'bun:test';
import { DomainError } from '../../../shared/domain';
import { Email } from './email';
import { User } from './user';

const make = (role: 'ADMIN' | 'EJECUTIVO' = 'ADMIN') =>
  User.rehydrate({
    id: 1,
    email: Email.create('a@b.com'),
    fullName: 'A',
    passwordHash: 'h',
    role,
    isActive: true,
    createdAt: new Date(),
  });

describe('Email', () => {
  test('normaliza a minúsculas y recorta', () => {
    expect(Email.create('  Foo@Bar.COM ').value).toBe('foo@bar.com');
  });
  test('rechaza correos inválidos', () => {
    expect(() => Email.create('no-es-correo')).toThrow(DomainError);
  });
});

describe('User.applyChanges', () => {
  test('no puede desactivarse a sí mismo', () => {
    expect(() =>
      make().applyChanges({ isActive: false }, { actorId: 1, otherActiveAdmins: 3 }),
    ).toThrow(/propio usuario/);
  });
  test('el último ADMIN activo no puede desactivarse', () => {
    expect(() =>
      make().applyChanges({ isActive: false }, { actorId: 2, otherActiveAdmins: 0 }),
    ).toThrow(/administrador activo/);
  });
  test('el último ADMIN activo no puede ser degradado', () => {
    expect(() =>
      make().applyChanges({ role: 'EJECUTIVO' }, { actorId: 2, otherActiveAdmins: 0 }),
    ).toThrow(DomainError);
  });
  test('permite degradar/desactivar si quedan otros ADMIN', () => {
    const user = make();
    user.applyChanges(
      { role: 'SUPERVISOR', fullName: ' Nuevo ' },
      { actorId: 2, otherActiveAdmins: 1 },
    );
    expect(user.role).toBe('SUPERVISOR');
    expect(user.fullName).toBe('Nuevo');
  });
  test('un no-admin puede desactivarse por otro sin importar el conteo', () => {
    const user = make('EJECUTIVO');
    user.applyChanges({ isActive: false }, { actorId: 2, otherActiveAdmins: 0 });
    expect(user.isActive).toBe(false);
  });
});
