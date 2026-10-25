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
  ConflictException,
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
import { inspectXlsxArchive } from '../spreadsheet/xlsx-archive-inspector';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Forma mínima del archivo que multer deja en disco (evita depender de @types/multer). */
interface UploadedXlsx {
  path: string;
  originalname: string;
  size: number;
}

/**
 * Nombre original saneado para `import_jobs.fileName` (NVARCHAR(260)): sin ruta, sin caracteres de
 * control y acotado. Solo se guarda como dato; en disco multer usa un nombre aleatorio.
 */
export function sanitizeUploadName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = Array.from(base)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();
  return (clean || 'archivo.xlsx').slice(0, 255);
}

/** Solo tipo y código del error: el mensaje puede contener valores de filas (datos personales). */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'error desconocido';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} ${code}` : error.name;
}

@Roles('ADMIN')
@ApiTags('Importación')
@ApiBearerAuth()
@Controller('import')
export class ImportController {
  private readonly logger = new Logger(ImportController.name);
  /**
   * Una importación a la vez por proceso: cada una mantiene en memoria la deduplicación y las
   * sucursales diferidas y escribe con varios lotes en vuelo; varias a la vez agotarían memoria y BD.
   */
  private running = false;

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
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5, parts: 6 },
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
    let launched = false;
    try {
      if (this.running) {
        throw new ConflictException('Ya hay una importación en curso; espera a que termine');
      }
      // Firma ZIP + directorio central (sin descomprimir): rechaza no-xlsx y bombas de compresión.
      const inspection = await inspectXlsxArchive(file.path);
      if (!inspection.ok) throw new BadRequestException(inspection.reason);
      this.running = true;
      const job = await this.createJob
        .execute({ fileName: sanitizeUploadName(file.originalname), createdById: user?.id ?? null })
        .catch((error: unknown) => {
          this.running = false;
          throw error;
        });
      launched = true;
      // En segundo plano: el cliente consulta GET /import/:id para ver el avance.
      void this.importCompanies
        .execute({ jobId: job.id, filePath: file.path })
        .catch((error) => this.logger.error(`Importación ${job.id} falló: ${describeError(error)}`))
        .finally(async () => {
          this.running = false;
          await rm(file.path, { force: true });
        });
      return { jobId: job.id };
    } finally {
      // Si no llegó a lanzarse, el temporal se borra ya (antes quedaba huérfano).
      if (!launched) await rm(file.path, { force: true });
    }
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
