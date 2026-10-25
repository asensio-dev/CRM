import type { UserRole } from '@axiom/contracts';
import { AggregateRoot, DomainError } from '../../../shared/domain';
import type { Email } from './email';

export interface UserProps {
  id: number | null;
  email: Email;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export interface UserChanges {
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface ChangeContext {
  /** Usuario que ejecuta el cambio. */
  actorId: number;
  /** Otros ADMIN activos (sin contar a este usuario). */
  otherActiveAdmins: number;
}

export class User extends AggregateRoot {
  private constructor(private props: UserProps) {
    super(props.id);
  }

  static create(input: {
    email: Email;
    fullName: string;
    passwordHash: string;
    role: UserRole;
    now: Date;
  }): User {
    const fullName = input.fullName.trim();
    if (!fullName) throw DomainError.validation('INVALID_NAME', 'El nombre es obligatorio');
    return new User({
      id: null,
      email: input.email,
      fullName,
      passwordHash: input.passwordHash,
      role: input.role,
      isActive: true,
      createdAt: input.now,
    });
  }

  static rehydrate(props: UserProps): User {
    return new User({ ...props });
  }

  get email(): Email {
    return this.props.email;
  }
  get fullName(): string {
    return this.props.fullName;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get role(): UserRole {
    return this.props.role;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Aplica cambios validando: no autodesactivarse y conservar siempre un ADMIN activo. */
  applyChanges(changes: UserChanges, ctx: ChangeContext): void {
    const nextActive = changes.isActive ?? this.props.isActive;
    const nextRole = changes.role ?? this.props.role;

    if (changes.isActive === false && this.props.isActive && this._id === ctx.actorId) {
      throw new DomainError('CANNOT_DEACTIVATE_SELF', 'No puedes desactivar tu propio usuario');
    }
    const wasActiveAdmin = this.props.isActive && this.props.role === 'ADMIN';
    const stillActiveAdmin = nextActive && nextRole === 'ADMIN';
    if (wasActiveAdmin && !stillActiveAdmin && ctx.otherActiveAdmins === 0) {
      throw new DomainError('LAST_ADMIN', 'Debe existir al menos un administrador activo');
    }

    if (changes.fullName !== undefined) {
      const name = changes.fullName.trim();
      if (!name) throw DomainError.validation('INVALID_NAME', 'El nombre es obligatorio');
      this.props.fullName = name;
    }
    this.props.role = nextRole;
    this.props.isActive = nextActive;
  }

  changePasswordHash(hash: string): void {
    this.props.passwordHash = hash;
  }
}
