import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  UNIT_OF_WORK,
  type UnitOfWork,
  type UseCase,
} from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain';
import { ActiveSessionChecker } from '../active-session-checker';

@Injectable()
export class ResetUserPasswordUseCase
  implements UseCase<{ userId: number; newPassword: string }, void>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: ActiveSessionChecker,
  ) {}

  async execute(input: { userId: number; newPassword: string }): Promise<void> {
    const hash = await this.hasher.hash(input.newPassword);
    await this.uow.run(async () => {
      const user = await this.users.findById(input.userId);
      if (!user) throw DomainError.notFound('USER_NOT_FOUND', 'Usuario no encontrado');
      user.changePasswordHash(hash);
      await this.users.save(user);
      await this.refreshTokens.revokeAllForUser(input.userId, this.clock.now());
    });
    // Un reset suele responder a un compromiso: los access tokens ya emitidos dejan de valer.
    this.sessions.revokeSessions(input.userId);
  }
}
