import type { UserRole } from '@axiom/contracts';
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

/**
 * Costuras de autenticación compartidas. El módulo `identity` registra un guard global
 * que lee estos metadatos y rellena `request.user`; el resto de módulos solo usa los decoradores.
 */
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: UserRole;
}

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Endpoint accesible sin token (login, health…). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe el endpoint a los roles indicados. Sin @Roles basta con estar autenticado. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Inyecta el usuario autenticado: `@CurrentUser() user: AuthenticatedUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
