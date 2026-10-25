import {
  type CompanyDetail,
  type CompanyListItem,
  type CompanySearchQuery,
  CompanySearchQuerySchema,
  type CreateBranch,
  CreateBranchSchema,
  type CreateCompany,
  CreateCompanySchema,
  type Paginated,
  type UpdateCompany,
  UpdateCompanySchema,
  type UserRole,
} from '@axiom/contracts';
import {
  Body,
  Controller,
  Get,
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
import { AddCompanyBranchUseCase } from '../../application/use-cases/add-company-branch.use-case';
import { CreateCompanyUseCase } from '../../application/use-cases/create-company.use-case';
import { GetCompanyDetailUseCase } from '../../application/use-cases/get-company-detail.use-case';
import { SearchCompaniesUseCase } from '../../application/use-cases/search-companies.use-case';
import { UpdateCompanyUseCase } from '../../application/use-cases/update-company.use-case';

/** La cédula del representante es dato personal: solo ADMIN y SUPERVISOR. Sin usuario = mínimo privilegio. */
const canViewSensitive = (user: AuthenticatedUser | undefined): boolean =>
  user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

/** Escrituras: sin usuario no hay actor (el guard global ya lo exige; esto es defensa en profundidad). */
function actorOf(user: AuthenticatedUser | undefined): { userId: number; role: UserRole } {
  if (!user) throw new UnauthorizedException('Autenticación requerida');
  return { userId: user.id, role: user.role };
}

@ApiTags('Empresas')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly searchCompanies: SearchCompaniesUseCase,
    private readonly getDetail: GetCompanyDetailUseCase,
    private readonly createCompany: CreateCompanyUseCase,
    private readonly updateCompany: UpdateCompanyUseCase,
    private readonly addBranch: AddCompanyBranchUseCase,
  ) {}

  @Get()
  search(
    @Query(new ZodValidationPipe(CompanySearchQuerySchema)) query: CompanySearchQuery,
  ): Promise<Paginated<CompanyListItem>> {
    return this.searchCompanies.execute(query);
  }

  @Get(':id')
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<CompanyDetail> {
    return this.getDetail.execute({ id, canViewSensitive: canViewSensitive(user) });
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateCompanySchema)) body: CreateCompany,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<CompanyDetail> {
    const { id } = await this.createCompany.execute({ data: body, createdById: user?.id ?? null });
    return this.getDetail.execute({ id, canViewSensitive: canViewSensitive(user) });
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateCompanySchema)) body: UpdateCompany,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<CompanyDetail> {
    await this.updateCompany.execute({ id, changes: body, actor: actorOf(user) });
    return this.getDetail.execute({ id, canViewSensitive: canViewSensitive(user) });
  }

  @Post(':id/branches')
  async createBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CreateBranchSchema)) body: CreateBranch,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<CompanyDetail> {
    await this.addBranch.execute({ companyId: id, branch: body, actor: actorOf(user) });
    return this.getDetail.execute({ id, canViewSensitive: canViewSensitive(user) });
  }
}
