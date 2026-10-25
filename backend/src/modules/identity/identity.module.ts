import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SessionIssuer } from './application/session-issuer';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { ResetUserPasswordUseCase } from './application/use-cases/reset-user-password.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { PASSWORD_HASHER, REFRESH_TOKEN_REPOSITORY, TOKEN_ISSUER, USER_REPOSITORY } from './domain';
import { AuthController } from './infrastructure/http/auth.controller';
import { JwtAuthGuard } from './infrastructure/http/jwt-auth.guard';
import { UsersController } from './infrastructure/http/users.controller';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma-refresh-token.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { BunPasswordHasher } from './infrastructure/security/bun-password-hasher';
import { JoseTokenIssuer } from './infrastructure/security/jose-token-issuer';

@Module({
  imports: [
    // Límite por IP; solo se aplica donde se usa ThrottlerGuard (login/refresh).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: PASSWORD_HASHER, useClass: BunPasswordHasher },
    { provide: TOKEN_ISSUER, useClass: JoseTokenIssuer },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    SessionIssuer,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetMeUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    ResetUserPasswordUseCase,
    ListUsersUseCase,
  ],
})
export class IdentityModule {}
