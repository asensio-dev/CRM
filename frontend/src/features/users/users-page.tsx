import type { UserDto } from '@axiom/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Pencil, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ROLE_LABELS } from '@/app/navigation';
import { useSessionStore } from '@/features/auth/session-store';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { Pagination } from '@/shared/ui/pagination';
import { QueryError } from '@/shared/ui/query-error';
import { TableSkeleton } from '@/shared/ui/table';
import { Tooltip } from '@/shared/ui/tooltip';
import { USERS_PAGE_SIZE, useUsers } from './queries';
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from './user-dialogs';

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
      Activo
    </Badge>
  ) : (
    <Badge variant="secondary">Inactivo</Badge>
  );
}

export function UsersPage() {
  const [page, setPage] = useState(1);
  const list = useUsers(page);
  const me = useSessionStore((s) => s.user);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);

  const columns = useMemo<ColumnDef<UserDto, unknown>[]>(
    () => [
      {
        id: 'fullName',
        header: 'Nombre',
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.fullName}
            {row.original.id === me?.id && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(tú)</span>
            )}
          </span>
        ),
      },
      { id: 'email', header: 'Correo', cell: ({ row }) => row.original.email },
      {
        id: 'role',
        header: 'Rol',
        cell: ({ row }) => <Badge variant="outline">{ROLE_LABELS[row.original.role]}</Badge>,
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
        {list.isPending ? (
          <TableSkeleton columns={5} rows={6} />
        ) : list.isError && !data ? (
          <QueryError error={list.error} onRetry={() => void list.refetch()} />
        ) : data && data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Users} title="Sin usuarios" description="Crea el primer usuario." />
          </div>
        ) : data ? (
          <>
            <DataTable
              columns={columns}
              data={data.items}
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
                    <Badge variant="outline">{ROLE_LABELS[u.role]}</Badge>
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
              page={data.page}
              pageSize={data.pageSize || USERS_PAGE_SIZE}
              total={data.total}
              disabled={list.isFetching}
              onPageChange={setPage}
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
