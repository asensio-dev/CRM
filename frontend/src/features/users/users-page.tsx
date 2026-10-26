import { USER_ROLES, type UserDto, type UserRole } from '@axiom/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Pencil, Plus, SearchX, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ROLE_LABELS } from '@/app/navigation';
import { useSessionStore } from '@/features/auth/session-store';
import { useClientList } from '@/shared/hooks/use-client-list';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { SearchInput } from '@/shared/ui/search-input';
import { Select } from '@/shared/ui/select';
import { TableSkeleton } from '@/shared/ui/table';
import { Tooltip } from '@/shared/ui/tooltip';
import { USERS_PAGE_SIZE, useUsers } from './queries';
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from './user-dialogs';

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-success/10 text-success">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
      Activo
    </Badge>
  ) : (
    <Badge variant="secondary">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/60" />
      Inactivo
    </Badge>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const userText = (u: UserDto) => `${u.fullName} ${u.email}`;

type StatusFilter = 'all' | 'active' | 'inactive';

export function UsersPage() {
  const list = useUsers();
  const me = useSessionStore((s) => s.user);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const scoped = useMemo(
    () =>
      (list.data ?? []).filter(
        (u) =>
          (!role || u.role === role) && (status === 'all' || u.isActive === (status === 'active')),
      ),
    [list.data, role, status],
  );
  const view = useClientList(scoped, { searchText: userText, pageSize: USERS_PAGE_SIZE });
  const filtering = !!view.query || !!role || status !== 'all';
  const clearFilters = () => {
    view.setQuery('');
    setRole('');
    setStatus('all');
  };

  const columns = useMemo<ColumnDef<UserDto, unknown>[]>(
    () => [
      {
        id: 'fullName',
        header: 'Nombre',
        cell: ({ row }) => (
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
            >
              {initials(row.original.fullName)}
            </span>
            <span className="font-medium">
              {row.original.fullName}
              {row.original.id === me?.id && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(tú)</span>
              )}
            </span>
          </span>
        ),
      },
      {
        id: 'email',
        header: 'Correo',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
      },
      {
        id: 'role',
        header: 'Rol',
        cell: ({ row }) => <Badge variant="secondary">{ROLE_LABELS[row.original.role]}</Badge>,
      },
      {
        id: 'active',
        header: 'Estado',
        cell: ({ row }) => <ActiveBadge active={row.original.isActive} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Acciones</span>,
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Tooltip content="Editar">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Editar ${row.original.fullName}`}
                onClick={() => setEditing(row.original)}
              >
                <Pencil />
              </Button>
            </Tooltip>
            <Tooltip content="Restablecer contraseña">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Restablecer contraseña de ${row.original.fullName}`}
                onClick={() => setResetting(row.original)}
              >
                <KeyRound />
              </Button>
            </Tooltip>
          </div>
        ),
      },
    ],
    [me?.id],
  );

  const data = list.data;

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Administra cuentas, roles y accesos."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nuevo usuario
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <section
          aria-label="Filtros"
          className="flex flex-wrap items-center gap-2 border-b px-4 py-3"
        >
          <SearchInput
            value={view.query}
            onValueChange={view.setQuery}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar usuarios"
            className="w-full sm:w-72"
          />
          <div className="w-full sm:w-44">
            <Select
              aria-label="Filtrar por rol"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRole | '');
                view.setPage(1);
              }}
            >
              <option value="">Todos los roles</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Select
              aria-label="Filtrar por estado"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                view.setPage(1);
              }}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
          </div>
          {filtering && (
            <Button variant="ghost" onClick={clearFilters} className="sm:ml-auto">
              Limpiar filtros
            </Button>
          )}
        </section>
        {list.isPending ? (
          <TableSkeleton columns={5} rows={6} />
        ) : list.isError && !data ? (
          <QueryError error={list.error} onRetry={() => void list.refetch()} />
        ) : data && view.total === 0 ? (
          <div className="p-5">
            <EmptyState
              className="border-0 bg-transparent"
              icon={filtering ? SearchX : Users}
              title={filtering ? 'Sin resultados' : 'Sin usuarios'}
              description={
                filtering
                  ? 'Ningún usuario coincide con la búsqueda o los filtros.'
                  : 'Crea el primer usuario.'
              }
              action={
                filtering ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : data ? (
          <>
            <DataTable
              columns={columns}
              data={view.pageItems}
              getRowId={(u) => String(u.id)}
              isFetching={list.isFetching}
              caption="Usuarios"
              renderCard={(u) => (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <ActiveBadge active={u.isActive} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setResetting(u)}>
                        Contraseña
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            />
            <Pagination
              page={view.page}
              pageSize={view.pageSize}
              total={view.total}
              onPageChange={view.setPage}
              onPageSizeChange={view.setPageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              itemLabel="usuarios"
            />
          </>
        ) : null}
      </Card>
      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      {editing && (
        <EditUserDialog user={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {resetting && (
        <ResetPasswordDialog user={resetting} open onOpenChange={(o) => !o && setResetting(null)} />
      )}
    </div>
  );
}
