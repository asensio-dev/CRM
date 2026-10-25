import {
  type AuthUser,
  type LoginRequest,
  LoginRequestSchema,
  type LoginResponse,
} from '@axiom/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  type AuthenticatedUser,
  CurrentUser,
  Public,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import type { Session } from '../../application/session-issuer';
import { GetMeUseCase } from '../../application/use-cases/get-me.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { TOKEN_ISSUER, type TokenIssuer } from '../../domain';

export const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/auth';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getMe: GetMeUseCase,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async doLogin(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.respond(res, await this.login.execute(body));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async doRefresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const token = this.readCookie(req);
    if (!token) throw new UnauthorizedException('Sesión inválida o expirada');
    try {
      return this.respond(res, await this.refresh.execute({ refreshToken: token }));
    } catch (error) {
      this.clearCookie(res);
      throw error;
    }
  }

  /** Pública: debe poder cerrar sesión aunque el access token ya haya caducado. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async doLogout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logoutUseCase.execute({ refreshToken: this.readCookie(req) });
    this.clearCookie(res);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.getMe.execute({ userId: user.id });
  }

  private respond(res: Response, session: Session): LoginResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: COOKIE_PATH,
      maxAge: this.tokens.refreshTtlSeconds * 1000,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: COOKIE_PATH,
    });
  }

  private readCookie(req: Request): string | undefined {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
