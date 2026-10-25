import type { UpdateUser, UserDto } from '@axiom/contracts';
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
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain';
import { ActiveSessionChecker } from '../active-session-checker';
import { toUserDto } from '../mappers';

@Injectable()
export class UpdateUserUseCase
  implements UseCase<{ actorId: number; userId: number; changes: UpdateUser }, UserDto>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: ActiveSessionChecker,
  ) {}

  async execute(input: { actorId: number; userId: number; changes: UpdateUser }): Promise<UserDto> {
    const { dto, revoked } = await this.uow.run(async () => {
      const user = await this.users.findById(input.userId);
      if (!user) throw DomainError.notFound('USER_NOT_FOUND', 'Usuario no encontrado');

      const before = { role: user.role, isActive: user.isActive };
      user.applyChanges(input.changes, {
        actorId: input.actorId,
        otherActiveAdmins: await this.users.countActiveAdmins(input.userId),
      });
      const saved = await this.users.save(user);

      // Cambiar rol o desactivar corta las sesiones: refresh tokens aquí y access tokens en el
      // guard (ActiveSessionChecker) en cuanto confirma la transacción.
      const mustRevoke = saved.role !== before.role || (before.isActive && !saved.isActive);
      if (mustRevoke) await this.refreshTokens.revokeAllForUser(input.userId, this.clock.now());
      return { dto: toUserDto(saved), revoked: mustRevoke };
    });
    if (revoked) this.sessions.revokeSessions(input.userId);
    return dto;
  }
}
