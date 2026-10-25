import { z } from 'zod';

/** Debe coincidir con el CHECK `users_role_check`. */
export const USER_ROLES = ['ADMIN', 'SUPERVISOR', 'EJECUTIVO'] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;
