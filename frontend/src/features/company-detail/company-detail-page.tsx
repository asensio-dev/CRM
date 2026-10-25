import type { CompanyDetail } from '@axiom/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  Building2,
  Clock,
  MapPin,
  MessageSquarePlus,
  Phone,
  Store,
  Users,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ChangeStatusMenu, RegisterContactDialog, usePipelineState } from '@/features/pipeline';
import { companyDetailKey, useTimeline } from '@/features/pipeline/api';
import { api, HttpError } from '@/shared/api';
import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Timeline } from './timeline';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? '—'}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" className="space-y-4" aria-busy="true" aria-label="Cargando empresa">
      <Skeleton className="h-24" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

function TimelineSection({ companyId }: { companyId: number }) {
  const q = useTimeline(companyId);
  const entries = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Línea de tiempo</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : q.isError ? (
          <div className="text-sm">
            <p className="mb-2 text-destructive">No se pudo cargar el historial.</p>
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay contactos ni cambios de estado.
          </p>
        ) : (
          <Timeline
            entries={entries}
            hasMore={!!q.hasNextPage}
            loadingMore={q.isFetchingNextPage}
            onLoadMore={() => void q.fetchNextPage()}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function CompanyDetailPage() {
  const params = useParams({ strict: false }) as { companyId?: number | string };
  const companyId = Number(params.companyId);
  const [contactOpen, setContactOpen] = useState(false);

  const company = useQuery({
    queryKey: companyDetailKey(companyId),
    queryFn: ({ signal }) => api.get<CompanyDetail>(`/companies/${companyId}`, signal),
    enabled: Number.isFinite(companyId),
  });
  const state = usePipelineState(companyId);

  if (company.isPending) return <DetailSkeleton />;
  if (company.isError || !company.data) {
    const notFound = company.error instanceof HttpError && company.error.statusCode === 404;
    return (
      <EmptyState
        icon={Building2}
        title={notFound ? 'Empresa no encontrada' : 'No se pudo cargar la empresa'}
        description={notFound ? 'Puede que haya sido eliminada.' : 'Intenta de nuevo.'}
        action={
          notFound ? (
            <Button asChild>
              <Link to="/empresas">Volver a empresas</Link>
            </Button>
          ) : (
            <Button onClick={() => company.refetch()}>Reintentar</Button>
          )
        }
      />
    );
  }

  const c = company.data;
  const status = state.data?.status ?? c.status;
  const address = c.particularAddress ?? c.shippingAddress;
  const lastContactAt = state.data?.lastContactAt ?? c.lastContactAt;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/empresas">
          <ArrowLeft aria-hidden="true" />
          Empresas
        </Link>
      </Button>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{c.legalName}</h1>
              <StatusBadge status={status} />
            </div>
            {c.tradeName && <p className="text-muted-foreground">{c.tradeName}</p>}
            <p className="text-sm text-muted-foreground">RUC {c.ruc}</p>
          </div>
          {/* SLOT-T2.4: el orquestador montará aquí <EditCompanyDialog /> y <AddBranchDialog />
              (botones "Editar empresa" / "Agregar sucursal", construidos en features/companies). */}
          <div data-slot="company-actions" className="flex flex-wrap items-center gap-2" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la empresa</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Teléfono">
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Phone className="size-3.5" aria-hidden="true" />
                      {c.phone}
                    </a>
                  ) : null}
                </Field>
                <Field label="Empleados">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden="true" />
                    {c.employeeCount.toLocaleString('es-NI')}
                  </span>
                </Field>
                <Field label="Dirección">
                  {address ? (
                    <span className="inline-flex items-start gap-1">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {address}
                    </span>
                  ) : null}
                </Field>
                <Field label="Sector">{c.sectorName}</Field>
                <Field label="Actividad económica">{c.activityName}</Field>
                <Field label="Representante legal">{c.legalRepName}</Field>
                {c.legalRepIdNumber !== undefined && (
                  <Field label="Cédula del representante">{c.legalRepIdNumber}</Field>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sucursales ({c.branches.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {c.branches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta empresa no tiene sucursales.</p>
              ) : (
                <ul className="divide-y">
                  {c.branches.map((b) => (
                    <li key={b.id} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                      <Store
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{b.tradeName ?? 'Sucursal'}</p>
                        <p className="text-muted-foreground">
                          {[b.address, b.phone, `${b.employeeCount} empleados`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <TimelineSection companyId={companyId} />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estado del pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status} />
              </div>
              <p
                className="inline-flex items-center gap-1 text-sm text-muted-foreground"
                title={lastContactAt ? formatAbsolute(lastContactAt) : undefined}
              >
                <Clock className="size-3.5" aria-hidden="true" />
                {lastContactAt
                  ? `Último contacto ${formatRelative(lastContactAt)}`
                  : 'Sin contacto registrado'}
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => setContactOpen(true)}>
                  <MessageSquarePlus aria-hidden="true" />
                  Registrar contacto
                </Button>
                <ChangeStatusMenu
                  companyId={companyId}
                  companyName={c.legalName}
                  state={state.data}
                  variant="outline"
                  size="default"
                />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <RegisterContactDialog
        companyId={companyId}
        companyName={c.legalName}
        open={contactOpen}
        onOpenChange={setContactOpen}
      />
    </div>
  );
}
