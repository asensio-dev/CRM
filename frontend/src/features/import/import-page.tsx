import { type ImportJobDto, type ImportJobStatus, normalizeSearchText } from '@axiom/contracts';
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
import { useClientList } from '@/shared/hooks/use-client-list';
import { errorMessage } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { SearchInput } from '@/shared/ui/search-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import {
  type ImportHistoryEntry,
  isJobFinished,
  REJECTIONS_PAGE_SIZE,
  REJECTIONS_PAGE_SIZE_OPTIONS,
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
  PROCESANDO: 'bg-accent text-accent-foreground',
  COMPLETADO: 'bg-success/10 text-success',
  FALLIDO: 'bg-destructive/10 text-destructive',
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
          'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          dragging ? 'border-primary bg-accent/60' : 'border-input bg-background/50',
          disabled && 'opacity-60',
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <UploadCloud className="size-6" aria-hidden="true" />
        </div>
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
    <div className="bg-card px-5 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
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
    <Card aria-live="polite" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="break-all">{job.fileName}</CardTitle>
            <CardDescription>
              {running
                ? 'Procesando el archivo; esta pantalla se actualiza sola cada 2 segundos.'
                : 'Importación terminada.'}
            </CardDescription>
          </div>
        </div>
        <Badge className={STATUS_CLASS[job.status]}>
          {running && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
          {job.status === 'COMPLETADO' && <CheckCircle2 className="size-3" aria-hidden="true" />}
          {job.status === 'FALLIDO' && <XCircle className="size-3" aria-hidden="true" />}
          {STATUS_LABEL[job.status]}
        </Badge>
      </div>
      {running && (
        <div className="px-5 pb-4">
          <div
            role="progressbar"
            aria-label="Procesando importación"
            className="h-2 overflow-hidden rounded-full bg-track"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-fill-fade" />
          </div>
        </div>
      )}
      {job.status === 'FALLIDO' && job.errorMessage && (
        <div className="px-5 pb-4">
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {job.errorMessage}
          </p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-5">
        <Stat label="Filas leídas" value={job.totalRows} />
        <Stat label="Insertadas" value={job.insertedCount} />
        <Stat label="Actualizadas" value={job.updatedCount} />
        <Stat label="Sucursales" value={job.branchCount} />
        <Stat label="Rechazadas" value={job.rejectedCount} tone="bad" />
      </dl>
    </Card>
  );
}

function Rejections({ jobId, total }: { jobId: number; total: number }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(REJECTIONS_PAGE_SIZE);
  const [query, setQuery] = useState('');
  const q = useImportRejections(jobId, page, true, pageSize);
  const needle = normalizeSearchText(query);
  // El API no filtra los rechazos por texto: la búsqueda se aplica a la página cargada.
  const rows = (q.data?.items ?? []).filter(
    (r) => !needle || normalizeSearchText(`${r.rowNumber} ${r.reason}`).includes(needle),
  );
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0 space-y-0.5">
          <CardTitle>Filas rechazadas ({nf.format(total)})</CardTitle>
          <CardDescription>
            Corrige estas filas en el Excel y vuelve a importarlo: solo se aplicarán los cambios.
          </CardDescription>
        </div>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Filtrar esta página"
          aria-label="Filtrar filas rechazadas"
          className="w-full sm:w-60"
        />
      </div>
      {q.isError && !q.data ? (
        <QueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className={cn('transition-opacity', q.isFetching && 'opacity-60')}>
            <Table aria-label="Filas rechazadas">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24">Fila</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {nf.format(r.rowNumber)}
                    </TableCell>
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
                {q.data && rows.length === 0 && needle && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={2} className="text-muted-foreground">
                      Nada en esta página coincide con «{query}».
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={q.data?.total ?? total}
            disabled={q.isFetching}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizeOptions={REJECTIONS_PAGE_SIZE_OPTIONS}
            itemLabel="filas"
          />
        </>
      )}
    </Card>
  );
}

const historyText = (e: ImportHistoryEntry) => `#${e.jobId} ${e.fileName}`;

function HistoryCard({
  entries,
  selected,
  onSelect,
}: {
  entries: ImportHistoryEntry[];
  selected: number | null;
  onSelect: (jobId: number) => void;
}) {
  const list = useClientList(entries, { searchText: historyText });
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden="true" />
          Importaciones de esta sesión
        </CardTitle>
        <SearchInput
          value={list.query}
          onValueChange={list.setQuery}
          placeholder="Buscar por archivo o número"
          aria-label="Buscar importaciones"
          className="w-full sm:w-60"
        />
      </div>
      {list.total === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Ninguna importación coincide con «{list.query}».
        </p>
      ) : (
        <>
          <Table aria-label="Importaciones de esta sesión">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Archivo</TableHead>
                <TableHead className="w-28">Hora</TableHead>
                <TableHead className="w-20 text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.pageItems.map((e) => (
                <TableRow key={e.jobId} className={cn(e.jobId === selected && 'bg-accent/40')}>
                  <TableCell className="max-w-0 truncate">
                    #{e.jobId} · {e.fileName}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    <time dateTime={e.startedAt}>
                      {new Date(e.startedAt).toLocaleTimeString('es-NI', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={e.jobId === selected ? 'secondary' : 'outline'}
                      onClick={() => onSelect(e.jobId)}
                      aria-label={`Ver importación ${e.jobId}`}
                    >
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            itemLabel="importaciones"
          />
        </>
      )}
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
    <div className="space-y-5">
      <PageHeader
        title="Importación"
        description="Carga masiva de empresas desde un archivo Excel (.xlsx)."
      />
      <div className="flex gap-3 rounded-xl border bg-wash/60 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <strong>Volver a importar es seguro (idempotente):</strong> las empresas se identifican
          por RUC, así que las existentes se actualizan y las nuevas se insertan; no se crean
          duplicados. Las filas con problemas se rechazan y se listan abajo sin detener el resto.
        </p>
      </div>
      <Card>
        <CardContent className="p-5">
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
        <HistoryCard entries={history.entries} selected={jobId} onSelect={setJobId} />
      )}
    </div>
  );
}
