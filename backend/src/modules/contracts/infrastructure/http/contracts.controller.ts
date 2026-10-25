import {
  type ChangeContractStatusRequest,
  ChangeContractStatusSchema,
  type ContractDto,
  type CreateContractCommand,
  CreateContractSchema,
  type ListContractsQuery,
  ListContractsQuerySchema,
  type Paginated,
  type UpdateContractDraftCommand,
  UpdateContractDraftSchema,
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
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import type { ContractActor } from '../../application/actor';
import { ChangeContractStatusUseCase } from '../../application/use-cases/change-contract-status.use-case';
import {
  GetContractUseCase,
  ListContractsUseCase,
} from '../../application/use-cases/contract-queries';
import { CreateContractUseCase } from '../../application/use-cases/create-contract.use-case';
import { UpdateContractDraftUseCase } from '../../application/use-cases/update-contract-draft.use-case';

function actorOf(user: AuthenticatedUser | undefined): ContractActor {
  if (!user) throw new UnauthorizedException('Autenticación requerida');
  return { userId: user.id, role: user.role };
}

/** EJECUTIVO: sus contratos; SUPERVISOR y ADMIN: todos (la regla vive en los casos de uso). */
@ApiTags('Contratos')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly listContracts: ListContractsUseCase,
    private readonly getContract: GetContractUseCase,
    private readonly createContract: CreateContractUseCase,
    private readonly updateDraft: UpdateContractDraftUseCase,
    private readonly changeStatus: ChangeContractStatusUseCase,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(new ZodValidationPipe(ListContractsQuerySchema)) query: ListContractsQuery,
  ): Promise<Paginated<ContractDto>> {
    return this.listContracts.execute({ query, actor: actorOf(user) });
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ContractDto> {
    return this.getContract.execute({ id, actor: actorOf(user) });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(CreateContractSchema)) body: CreateContractCommand,
  ): Promise<ContractDto> {
    return this.createContract.execute({ data: body, actor: actorOf(user) });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateContractDraftSchema)) body: UpdateContractDraftCommand,
  ): Promise<ContractDto> {
    return this.updateDraft.execute({ id, data: body, actor: actorOf(user) });
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  status(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ChangeContractStatusSchema)) body: ChangeContractStatusRequest,
  ): Promise<ContractDto> {
    return this.changeStatus.execute({ id, to: body.to, actor: actorOf(user) });
  }
}
