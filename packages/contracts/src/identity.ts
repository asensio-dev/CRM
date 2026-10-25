import { z } from 'zod';

/** Debe coincidir con el CHECK `users_role_check`. */
export const USER_ROLES = ['ADMIN', 'SUPERVISOR', 'EJECUTIVO'] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * API de autenticación (módulo identity):
 *   POST /api/auth/login    body LoginRequest → LoginResponse (+ cookie httpOnly `refresh_token`)
 *   POST /api/auth/refresh  usa la cookie        → LoginResponse (rota la cookie)
 *   POST /api/auth/logout   revoca el refresh token y borra la cookie → 204
 *   GET  /api/auth/me       Bearer access token  → AuthUser
 * El access token se guarda solo en memoria en el frontend, nunca en localStorage.
 */
export const LoginRequestSchema = z.object({
  email: z.email().max(150),
  password: z.string().min(8).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.number().int(),
  email: z.email(),
  fullName: z.string(),
  role: UserRoleSchema,
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// ───────────────────────── Administración de usuarios ─────────────────────────
//   GET   /api/users                      (ADMIN) ?page&pageSize → Paginated<UserDto>
//   POST  /api/users                      (ADMIN) CreateUser     → UserDto
//   PATCH /api/users/:id                  (ADMIN) UpdateUser     → UserDto
//   POST  /api/users/:id/reset-password   (ADMIN) ResetPassword  → 204

export const PasswordSchema = z.string().min(8).max(200);

export const CreateUserSchema = z.object({
  email: z.email().max(150),
  fullName: z.string().trim().min(1).max(150),
  password: PasswordSchema,
  role: UserRoleSchema,
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150).optional(),
    role: UserRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Indica al menos un campo a modificar',
  });
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const ResetPasswordSchema = z.object({ newPassword: PasswordSchema });
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

export interface UserDto {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** ISO 8601 */
  createdAt: string;
}
