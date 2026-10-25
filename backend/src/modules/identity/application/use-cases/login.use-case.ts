import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain';
import { type Session, SessionIssuer } from '../session-issuer';

export const INVALID_CREDENTIALS = 'Credenciales inválidas';

@Injectable()
export class LoginUseCase implements UseCase<{ email: string; password: string }, Session> {
  /** Hash descartable para igualar el tiempo cuando el usuario no existe. */
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: { email: string; password: string }): Promise<Session> {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    // Siempre se verifica una contraseña (real o falsa) → tiempo similar con/sin usuario.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordOk = await this.hasher.verify(input.password, hash);
    if (!user || !passwordOk || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.sessions.issue(user);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(crypto.randomUUID());
    return this.dummyHash;
  }
}
