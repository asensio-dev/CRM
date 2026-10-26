import { Link } from '@tanstack/react-router';
import { ChevronsLeft, ChevronsRight, Hexagon, X } from 'lucide-react';
import { useSessionStore } from '@/features/auth/session-store';
import { APP_VERSION } from '@/shared/lib/app-version';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { navForRole } from '../navigation';
import { useLayoutStore } from './layout-store';

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const role = useSessionStore((s) => s.user?.role);
  return (
    <nav aria-label="Principal" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {navForRole(role).map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
            collapsed && 'justify-center px-2',
          )}
          activeProps={{ className: 'bg-sidebar-accent text-sidebar-foreground' }}
        >
          <Icon className="size-4.5 shrink-0" aria-hidden="true" />
          <span className={cn(collapsed && 'sr-only')}>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-2')}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Hexagon className="size-4.5" aria-hidden="true" />
      </div>
      <span
        className={cn('text-base font-semibold tracking-tight text-white', collapsed && 'sr-only')}
      >
        AXIOM CRM
      </span>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, mobileOpen, toggleCollapsed, setMobileOpen } = useLayoutStore();
  const Toggle = sidebarCollapsed ? ChevronsRight : ChevronsLeft;

  return (
    <>
      {/* Escritorio */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        <Brand collapsed={sidebarCollapsed} />
        <NavList collapsed={sidebarCollapsed} />
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
            className="w-full text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Toggle aria-hidden="true" />
            {!sidebarCollapsed && 'Contraer'}
          </Button>
          <p
            data-testid="app-version"
            className="mt-2 text-center text-[11px] text-sidebar-muted/70"
            title={`AXIOM CRM v${APP_VERSION}`}
          >
            v{APP_VERSION}
          </p>
        </div>
      </aside>

      {/* Móvil: cajón */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center justify-between">
              <Brand collapsed={false} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar menú"
                className="mr-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => setMobileOpen(false)}
              >
                <X />
              </Button>
            </div>
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
