import type { ImportJobDto, ImportJobStatus } from '@axiom/contracts';
import {
  CheckCircle2,
  FileSpreadsheet,
  History,
  Info,
  Loader2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import {
  isJobFinished,
  REJECTIONS_PAGE_SIZE,
  useImportHistory,
  useImportJob,
  useImportRejections,
  useStartImport,
  validateImportFile,
} from './queries';

const nf = new Intl.NumberFormat('es-NI');

const STATUS_LABEL: Record<ImportJobStatus, string> = {
  PENDIENTE: 'En cola',
  PROCESANDO: 'Procesando',
  COMPLETADO: 'Completado',
  FALLIDO: 'Fallido',
};

const STATUS_CLASS: Record<ImportJobStatus, string> = {
  PENDIENTE: 'bg-muted text-muted-foreground',
  PROCESANDO: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  COMPLETADO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  FALLIDO: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
};

function Dropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = (file: File | undefined) => {
    if (!file) return;
    const problem = validateImportFile(file);
    setError(problem);
    if (!problem) onFile(file);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) take(e.dataTransfer.files[0]);
  };

  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: zona de arrastrar y soltar; la alternativa accesible es el botón. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-primary bg-accent' : 'border-input',
          disabled && 'opacity-60',
        )}
      >
        <UploadCloud className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">
          Arrastra aquí el archivo <strong>.xlsx</strong> o
        </p>
        <Button onClick={() => inputRef.current?.click()} disabled={disabled}>
          Seleccionar archivo
        </Button>
        <p className="text-xs text-muted-foreground">Formato .xlsx, máximo 50 MB.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Archivo Excel (.xlsx)"
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'bad' && value > 0 && 'text-destructive',
        )}
      >
        {nf.format(value)}
      </dd>
    </div>
  );
}

function JobCard({ job }: { job: ImportJobDto }) {
  const running = !isJobFinished(job);
  return (
    <Card aria-live="polite">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            <span className="break-all">{job.fileName}</span>
          </CardTitle>
          <Badge className={STATUS_CLASS[job.status]}>
            {running && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
            {job.status === 'COMPLETADO' && <CheckCircle2 className="size-3" aria-hidden="true" />}
            {job.status === 'FALLIDO' && <XCircle className="size-3" aria-hidden="true" />}
            {STATUS_LABEL[job.status]}
          </Badge>
        </div>
        <CardDescription>
          {running
            ? 'Procesando el archivo; esta pantalla se actualiza sola cada 2 segundos.'
            : 'Importación terminada.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {running && (
          <div
            role="progressbar"
            aria-label="Procesando importación"
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        )}
        {job.status === 'FALLIDO' && job.errorMessage && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {job.errorMessage}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Filas leídas" value={job.totalRows} />
          <Stat label="Insertadas" value={job.insertedCount} />
          <Stat label="Actualizadas" value={job.updatedCount} />
          <Stat label="Sucursales" value={job.branchCount} />
          <Stat label="Rechazadas" value={job.rejectedCount} tone="bad" />
        </dl>
      </CardContent>
    </Card>
  );
}

function Rejections({ jobId, total }: { jobId: number; total: number }) {
  const [page, setPage] = useState(1);
  const q = useImportRejections(jobId, page, true);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filas rechazadas ({nf.format(total)})</CardTitle>
        <CardDescription>
          Corrige estas filas en el Excel y vuelve a importarlo: solo se aplicarán los cambios.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {q.isError && !q.data ? (
          <QueryError error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <Table aria-label="Filas rechazadas">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24">Fila</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data?.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{nf.format(r.rowNumber)}</TableCell>
                    <TableCell>{r.reason}</TableCell>
                  </TableRow>
                ))}
                {q.isPending && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              pageSize={REJECTIONS_PAGE_SIZE}
              total={q.data?.total ?? total}
              disabled={q.isFetching}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ImportPage() {
  const start = useStartImport();
  const history = useImportHistory();
  const [jobId, setJobId] = useState<number | null>(null);
  const job = useImportJob(jobId);

  const upload = async (file: File) => {
    try {
      const { jobId: id } = await start.mutateAsync(file);
      history.add({ jobId: id, fileName: file.name, startedAt: new Date().toISOString() });
      setJobId(id);
      toast.success('Importación iniciada');
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo subir el archivo.'));
    }
  };

  const running = start.isPending || (jobId !== null && !!job.data && !isJobFinished(job.data));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importación"
        description="Carga masiva de empresas desde un archivo Excel (.xlsx)."
      />
      <div className="flex gap-3 rounded-lg border bg-accent/40 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
        <p>
          <strong>Volver a importar es seguro (idempotente):</strong> las empresas se identifican
          por RUC, así que las existentes se actualizan y las nuevas se insertan; no se crean
          duplicados. Las filas con problemas se rechazan y se listan abajo sin detener el resto.
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <Dropzone onFile={(f) => void upload(f)} disabled={running} />
          {start.isPending && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Subiendo archivo…
            </p>
          )}
        </CardContent>
      </Card>

      {jobId !== null && job.isError && !job.data && (
        <QueryError
          error={job.error}
          onRetry={() => void job.refetch()}
          title="No se pudo consultar la importación"
        />
      )}
      {job.data && <JobCard job={job.data} />}
      {job.data && isJobFinished(job.data) && job.data.rejectedCount > 0 && (
        <Rejections key={job.data.id} jobId={job.data.id} total={job.data.rejectedCount} />
      )}

      {history.entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4" aria-hidden="true" /> Importaciones de esta sesión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {history.entries.map((e) => (
                <li key={e.jobId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    #{e.jobId} · {e.fileName}
                  </span>
                  <span className="flex items-center gap-3">
                    <time className="text-xs text-muted-foreground" dateTime={e.startedAt}>
                      {new Date(e.startedAt).toLocaleTimeString('es-NI', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <Button
                      size="sm"
                      variant={e.jobId === jobId ? 'secondary' : 'outline'}
                      onClick={() => setJobId(e.jobId)}
                      aria-label={`Ver importación ${e.jobId}`}
                    >
                      Ver
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
