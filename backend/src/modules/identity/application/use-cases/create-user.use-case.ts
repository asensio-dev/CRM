import type { CreateUser, UserDto } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock, type UseCase } from '../../../../shared/application';
import { DomainError } from '../../../../shared/domain';
import {
  Email,
  PASSWORD_HASHER,
  type PasswordHasher,
  USER_REPOSITORY,
  User,
  type UserRepository,
} from '../../domain';
import { toUserDto } from '../mappers';

@Injectable()
export class CreateUserUseCase implements UseCase<CreateUser, UserDto> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateUser): Promise<UserDto> {
    const email = Email.create(input.email);
    if (await this.users.findByEmail(email.value)) {
      throw DomainError.conflict('EMAIL_TAKEN', 'Ya existe un usuario con ese correo');
    }
    const user = User.create({
      email,
      fullName: input.fullName,
      role: input.role,
      passwordHash: await this.hasher.hash(input.password),
      now: this.clock.now(),
    });
    return toUserDto(await this.users.save(user));
  }
}
