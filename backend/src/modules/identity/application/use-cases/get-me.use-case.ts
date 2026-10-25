import type { AuthUser } from '@axiom/contracts';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { USER_REPOSITORY, type UserRepository } from '../../domain';
import { toAuthUser } from '../mappers';

@Injectable()
export class GetMeUseCase implements UseCase<{ userId: number }, AuthUser> {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(input: { userId: number }): Promise<AuthUser> {
    const user = await this.users.findById(input.userId);
    if (!user?.isActive) throw new UnauthorizedException('Sesión inválida');
    return toAuthUser(user);
  }
}
