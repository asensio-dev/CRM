import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useSessionStore } from '@/features/auth/session-store';
import { useTheme } from '@/shared/hooks/use-theme';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ROLE_LABELS } from '../navigation';
import { useLayoutStore } from './layout-store';

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function Topbar() {
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const { theme, toggle } = useTheme();
  const setMobileOpen = useLayoutStore((s) => s.setMobileOpen);
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    await navigate({ to: '/login', search: {} });
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Abrir menú"
        onClick={() => setMobileOpen(true)}
      >
        <Menu />
      </Button>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Menú de usuario">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
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
