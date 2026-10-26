import { Link } from '@tanstack/react-router';
import { Moon, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useSessionStore } from '@/features/auth/session-store';
import { useTheme } from '@/shared/hooks/use-theme';
import { APP_VERSION } from '@/shared/lib/app-version';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { NAV_GROUPS, navForRole } from '../navigation';
import { useLayoutStore } from './layout-store';

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const role = useSessionStore((s) => s.user?.role);
  const items = navForRole(role);
  return (
    <nav aria-label="Principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="space-y-0.5">
            <p
              className={cn(
                'px-3 pb-1.5 text-xs font-medium text-sidebar-muted/80',
                collapsed && 'sr-only',
              )}
            >
              {group}
            </p>
            {groupItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-sidebar-muted transition-[color,background-color,box-shadow] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  collapsed && 'justify-center px-2',
                )}
                activeProps={{
                  className:
                    'border-sidebar-border! bg-sidebar-accent! text-sidebar-foreground! shadow-sm [&_svg]:text-primary',
                }}
              >
                <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                <span className={cn(collapsed && 'sr-only')}>{label}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex h-16 items-center gap-2.5 px-5', collapsed && 'justify-center px-2')}>
      <img
        src="/brand/axiom-logo.png"
        alt=""
        width={44}
        height={34}
        className="h-[30px] w-auto shrink-0 drop-shadow-[0_1px_1px_rgb(16_24_40/0.12)]"
      />
      <span className={cn('leading-none', collapsed && 'sr-only')}>
        <span className="block text-[15px] font-semibold tracking-[0.08em] text-sidebar-foreground">
          AXIOM
        </span>
        <span className="mt-0.5 block text-[11px] font-medium text-sidebar-muted">CRM</span>
      </span>
    </div>
  );
}

function ThemeSwitch({ collapsed }: { collapsed: boolean }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  if (collapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        className="mx-auto flex"
      >
        <Moon aria-hidden="true" />
      </Button>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Moon className="size-4.5" aria-hidden="true" />
      <span className="flex-1 text-left">Modo oscuro</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          dark ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left] duration-200',
            dark ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, mobileOpen, toggleCollapsed, setMobileOpen } = useLayoutStore();
  const Toggle = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      {/* Escritorio */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          sidebarCollapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div className="flex items-center justify-between">
          <Brand collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-label="Contraer menú"
              className="mr-3 size-8"
            >
              <Toggle aria-hidden="true" />
            </Button>
          )}
        </div>
        <NavList collapsed={sidebarCollapsed} />
        <div className="space-y-1 border-t border-sidebar-border p-3">
          <ThemeSwitch collapsed={sidebarCollapsed} />
          {sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-label="Expandir menú"
              className="mx-auto flex"
            >
              <Toggle aria-hidden="true" />
            </Button>
          )}
          <p
            data-testid="app-version"
            className={cn(
              'px-3 pt-1 text-[11px] tabular-nums text-sidebar-muted/70',
              sidebarCollapsed && 'px-0 text-center',
            )}
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
            className="absolute inset-0 bg-[#0b1220]/35"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-lg">
            <div className="flex items-center justify-between">
              <Brand collapsed={false} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar menú"
                className="mr-3"
                onClick={() => setMobileOpen(false)}
              >
                <X />
              </Button>
            </div>
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-sidebar-border p-3">
              <ThemeSwitch collapsed={false} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
