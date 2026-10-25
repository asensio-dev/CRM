import type { Paginated, UserDto } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { USER_REPOSITORY, type UserRepository } from '../../domain';
import { toUserDto } from '../mappers';

@Injectable()
export class ListUsersUseCase
  implements UseCase<{ page: number; pageSize: number }, Paginated<UserDto>>
{
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(input: { page: number; pageSize: number }): Promise<Paginated<UserDto>> {
    const { items, total } = await this.users.list(input.page, input.pageSize);
    return { items: items.map(toUserDto), page: input.page, pageSize: input.pageSize, total };
  }
}
