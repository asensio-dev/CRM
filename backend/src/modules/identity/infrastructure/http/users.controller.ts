import {
  type CreateUser,
  CreateUserSchema,
  type PaginationQuery,
  PaginationQuerySchema,
  type ResetPassword,
  ResetPasswordSchema,
  type UpdateUser,
  UpdateUserSchema,
} from '@axiom/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { ResetUserPasswordUseCase } from '../../application/use-cases/reset-user-password.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';

@Roles('ADMIN')
@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly resetPassword: ResetUserPasswordUseCase,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery) {
    return this.listUsers.execute(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUser) {
    return this.createUser.execute(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUser,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.updateUser.execute({ actorId: actor.id, userId: id, changes: body });
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPassword,
  ): Promise<void> {
    await this.resetPassword.execute({ userId: id, newPassword: body.newPassword });
  }
}
