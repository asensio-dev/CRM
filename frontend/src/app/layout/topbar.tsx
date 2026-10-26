import { useLocation, useNavigate } from '@tanstack/react-router';
import { CalendarDays, ChevronDown, LogOut, Menu } from 'lucide-react';
import { useSessionStore } from '@/features/auth/session-store';
import { formatLongDay, managuaDay } from '@/shared/lib/managua-time';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { NAV_ITEMS, ROLE_LABELS } from '../navigation';
import { useLayoutStore } from './layout-store';

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Sección actual según la ruta (la ficha de empresa cuelga de Empresas). */
function useCurrentSection() {
  const pathname = useLocation({ select: (l) => l.pathname });
  return NAV_ITEMS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
}

export function Topbar() {
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const setMobileOpen = useLayoutStore((s) => s.setMobileOpen);
  const navigate = useNavigate();
  const section = useCurrentSection();
  const today = formatLongDay(managuaDay());

  const onLogout = async () => {
    await logout();
    await navigate({ to: '/login', search: {} });
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Abrir menú"
        onClick={() => setMobileOpen(true)}
      >
        <Menu />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {section && (
          <>
            <span className="hidden text-muted-foreground sm:inline">{section.group}</span>
            <span aria-hidden="true" className="hidden text-input sm:inline">
              /
            </span>
            <span className="truncate font-medium">{section.label}</span>
          </>
        )}
      </div>
      <p className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-xs lg:flex">
        <CalendarDays className="size-3.5" aria-hidden="true" />
        <span className="first-letter:uppercase">{today}</span>
      </p>
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 gap-2.5 px-2 text-foreground"
              aria-label="Menú de usuario"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground ring-1 ring-primary/15">
                {initials(user.fullName)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium">{user.fullName}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                </span>
              </span>
              <ChevronDown className="text-muted-foreground" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <span className="block font-medium">{user.fullName}</span>
              <span className="block text-xs text-muted-foreground">{user.email}</span>
              <span className="block text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogout}>
              <LogOut aria-hidden="true" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
