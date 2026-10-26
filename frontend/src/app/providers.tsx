import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useSessionStore } from '@/features/auth/session-store';
import { useTheme } from '@/shared/hooks/use-theme';
import { cn } from '@/shared/lib/cn';
import { Skeleton } from '@/shared/ui/skeleton';
import { useLayoutStore } from './layout/layout-store';
import { PageFallback } from './page-fallbacks';
import { createAppRouter } from './router';

/**
 * Mientras se restaura la sesión se pinta ya el marco de la app (barra lateral, cabecera y el
 * esqueleto de la pantalla pedida), en vez de un spinner a pantalla completa: cuando la app
 * aparece, nada cambia de sitio.
 */
function Splash() {
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const path = window.location.pathname;
  if (path.startsWith('/login')) {
    return <div role="status" aria-label="Cargando" className="min-h-screen bg-background" />;
  }
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="flex h-screen overflow-hidden bg-background"
    >
      <aside
        aria-hidden="true"
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div
          className={cn('flex h-16 items-center gap-2.5 px-5', collapsed && 'justify-center px-2')}
        >
          <img
            src="/brand/axiom-logo.png"
            alt=""
            width={44}
            height={34}
            className="h-[30px] w-auto"
          />
          {!collapsed && (
            <span className="leading-none">
              <span className="block text-[15px] font-semibold tracking-[0.08em] text-sidebar-foreground">
                AXIOM
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-sidebar-muted">CRM</span>
            </span>
          )}
        </div>
        <div className="flex-1 space-y-5 px-3 py-3">
          {[4, 3, 2].map((n, g) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
            <div key={g} className="space-y-2">
              {!collapsed && <Skeleton className="mx-3 mb-2.5 h-3 w-20" />}
              {Array.from({ length: n }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: relleno estático.
                <div key={i} className="flex h-9 items-center gap-3 px-3">
                  <Skeleton className="size-4.5 shrink-0" />
                  {!collapsed && <Skeleton className="h-3.5 w-24" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/80 px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto size-8 rounded-full" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
        </header>
        <main className="bg-workspace relative flex-1 overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[90rem]">
            <PageFallback path={path} />
          </div>
        </main>
      </div>
    </div>
  );
}

export function App({ router: injected }: { router?: ReturnType<typeof createAppRouter> }) {
  const [router] = useState(() => injected ?? createAppRouter());
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  const status = useSessionStore((s) => s.status);
  const theme = useTheme((s) => s.theme);

  // Restaura la sesión (refresh silencioso con la cookie) al arrancar.
  useEffect(() => {
    if (useSessionStore.getState().status === 'loading') {
      void useSessionStore.getState().restore();
    }
  }, []);

  // Cada cambio de sesión re-evalúa los guards (expulsa si se perdió, entra si se ganó).
  useEffect(() => {
    if (status === 'anonymous') queryClient.clear();
    if (status !== 'loading') void router.invalidate();
  }, [status, router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {status === 'loading' ? <Splash /> : <RouterProvider router={router} />}
      <Toaster theme={theme} richColors position="top-right" />
    </QueryClientProvider>
  );
}
