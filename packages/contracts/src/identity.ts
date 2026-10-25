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
