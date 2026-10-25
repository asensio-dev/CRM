import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useSessionStore } from '@/features/auth/session-store';
import { useTheme } from '@/shared/hooks/use-theme';
import { createAppRouter } from './router';

function Splash() {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="flex min-h-screen items-center justify-center bg-background"
    >
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
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
