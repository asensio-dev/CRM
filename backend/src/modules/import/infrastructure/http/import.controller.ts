import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import {
  type ImportJobDto,
  type ImportRejectionDto,
  type ImportStartedResponse,
  type Paginated,
  type PaginationQuery,
  PaginationQuerySchema,
} from '@axiom/contracts';
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import { ImportCompaniesUseCase } from '../../application/use-cases/import-companies.use-case';
import {
  CreateImportJobUseCase,
  GetImportJobUseCase,
  ListImportRejectionsUseCase,
} from '../../application/use-cases/import-job-queries';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Forma mínima del archivo que multer deja en disco (evita depender de @types/multer). */
interface UploadedXlsx {
  path: string;
  originalname: string;
  size: number;
}

@Roles('ADMIN')
@ApiTags('Importación')
@ApiBearerAuth()
@Controller('import')
export class ImportController {
  private readonly logger = new Logger(ImportController.name);

  constructor(
    private readonly createJob: CreateImportJobUseCase,
    private readonly importCompanies: ImportCompaniesUseCase,
    private readonly getJob: GetImportJobUseCase,
    private readonly listRejections: ListImportRejectionsUseCase,
  ) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      dest: join(tmpdir(), 'axiom-import'),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (extname(file.originalname).toLowerCase() === '.xlsx') cb(null, true);
        else cb(new BadRequestException('Solo se aceptan archivos .xlsx'), false);
      },
    }),
  )
  async start(
    @UploadedFile() file: UploadedXlsx | undefined,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<ImportStartedResponse> {
    if (!file) throw new BadRequestException('Falta el archivo (campo "file", .xlsx)');

    const job = await this.createJob.execute({
      fileName: file.originalname,
      createdById: user?.id ?? null,
    });
    // En segundo plano: el cliente consulta GET /import/:id para ver el avance.
    void this.importCompanies
      .execute({ jobId: job.id, filePath: file.path })
      .catch((error) => this.logger.error(`Importación ${job.id} falló: ${String(error)}`))
      .finally(() => rm(file.path, { force: true }));
    return { jobId: job.id };
  }

  @Get(':id')
  job(@Param('id', ParseIntPipe) id: number): Promise<ImportJobDto> {
    return this.getJob.execute(id);
  }

  @Get(':id/rejections')
  rejections(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<ImportRejectionDto>> {
    return this.listRejections.execute({ jobId: id, query });
  }
}
