import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type AuthenticatedUser,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { TOKEN_ISSUER, type TokenIssuer } from '../../domain';

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/** Guard global: exige `Authorization: Bearer <access>` salvo en rutas @Public y aplica @Roles. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization;
    const [scheme, token] = typeof header === 'string' ? header.split(' ') : [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Token de acceso requerido');
    }

    const claims = await this.tokens.verifyAccess(token);
    if (!claims) throw new UnauthorizedException('Token de acceso inválido o expirado');

    request.user = { id: claims.userId, email: claims.email, role: claims.role };

    const roles = this.reflector.getAllAndOverride<AuthenticatedUser['role'][] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (roles && roles.length > 0 && !roles.includes(claims.role)) {
      throw new ForbiddenException('No tienes permisos para esta operación');
    }
    return true;
  }
}
