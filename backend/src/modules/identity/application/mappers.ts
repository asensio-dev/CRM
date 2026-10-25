import type { AuthUser, UserDto } from '@axiom/contracts';
import type { User } from '../domain';

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id as number,
    email: user.email.value,
    fullName: user.fullName,
    role: user.role,
  };
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id as number,
    email: user.email.value,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}
