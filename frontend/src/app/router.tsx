import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router';
import { Compass } from 'lucide-react';
import { type ComponentType, lazy, type ReactElement, Suspense } from 'react';
import { z } from 'zod';
import { redirectIfAuthenticated, requireAuth, requireRole } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/login-page';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { PlaceholderPage } from '@/shared/ui/placeholder-page';
import { Skeleton } from '@/shared/ui/skeleton';
import { AppLayout } from './layout/app-layout';
import { NAV_ITEMS, type NavItem } from './navigation';

/**
 * Página cargada bajo demanda (chunk propio por pantalla): el bundle inicial solo lleva el
 * layout, el login y lo compartido. Antes era un único chunk de ~970 kB (ver docs/rendimiento-qa.md).
 */
const lazyPage = (load: () => Promise<ComponentType>): ComponentType =>
  lazy(async () => ({ default: await load() }));

function LazyRoute({ page: Page }: { page: ComponentType }): ReactElement {
  return (
    <Suspense
      fallback={
        <div role="status" aria-busy="true" aria-label="Cargando página" className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      <Page />
    </Suspense>
  );
}

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6">
      <EmptyState
        icon={Compass}
        title="Página no encontrada"
        description="La dirección que buscas no existe o fue movida."
        action={
          <Button asChild>
            <a href="/mi-semana">Ir a Mi semana</a>
          </Button>
        }
      />
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ search }) => redirectIfAuthenticated(search),
  component: LoginPage,
});

/** Layout sin ruta propia: todo lo que cuelga de aquí exige sesión. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: ({ location }) => requireAuth(location),
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/mi-semana' });
  },
});

const PAGES: Record<NavItem['to'], { description: string; wave: 2 | 3 }> = {
  '/mi-semana': { description: 'Tu plan semanal de contactos y avance de cuota.', wave: 3 },
  '/pipeline': { description: 'Tablero kanban de empresas por estado.', wave: 2 },
  '/empresas': { description: 'Búsqueda y ficha de empresas.', wave: 2 },
  '/cartera': { description: 'Carteras rotativas y ciclo de 3 semanas.', wave: 3 },
  '/citas': { description: 'Agenda de citas con empresas.', wave: 3 },
  '/contratos': { description: 'Seguimiento de contratos.', wave: 3 },
  '/tablero': { description: 'Indicadores y cumplimiento de cuota.', wave: 3 },
  '/importacion': { description: 'Carga masiva de empresas desde Excel.', wave: 2 },
  '/usuarios': { description: 'Administración de usuarios y roles.', wave: 2 },
};

/**
 * Página real de cada entrada del menú. Cada feature añade SOLO su línea (ver docs/AGENTS.md);
 * las que faltan muestran el placeholder de su ola.
 */
const PAGE_COMPONENTS: Partial<Record<NavItem['to'], ComponentType>> = {
  '/mi-semana': lazyPage(() => import('@/features/my-week').then((m) => m.MyWeekPage)),
  '/cartera': lazyPage(() => import('@/features/portfolio').then((m) => m.PortfolioPage)),
  '/pipeline': lazyPage(() => import('@/features/pipeline').then((m) => m.PipelinePage)),
  '/tablero': lazyPage(() => import('@/features/dashboard').then((m) => m.DashboardPage)),
  '/citas': lazyPage(() => import('@/features/appointments').then((m) => m.AppointmentsPage)),
  '/contratos': lazyPage(() => import('@/features/contracts').then((m) => m.ContractsPage)),
  '/empresas': lazyPage(() => import('@/features/companies').then((m) => m.CompaniesPage)),
  '/importacion': lazyPage(() => import('@/features/import').then((m) => m.ImportPage)),
  '/usuarios': lazyPage(() => import('@/features/users').then((m) => m.UsersPage)),
};

const CompanyDetailPage = lazyPage(() =>
  import('@/features/company-detail/company-detail-page').then((m) => m.CompanyDetailPage),
);

const pageRoutes = NAV_ITEMS.map((item) => {
  const page = PAGES[item.to];
  const Page = PAGE_COMPONENTS[item.to];
  return createRoute({
    getParentRoute: () => appRoute,
    path: item.to,
    beforeLoad: item.roles ? () => requireRole(item.roles ?? []) : undefined,
    component: Page
      ? () => <LazyRoute page={Page} />
      : () => (
          <PlaceholderPage
            title={item.label}
            description={page.description}
            icon={item.icon}
            wave={page.wave}
          />
        ),
  });
});

/** Ficha de empresa: /empresas/123 (la enlazan el listado de empresas, el kanban y Mi semana). */
export const companyDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/empresas/$companyId',
  params: {
    parse: ({ companyId }) => ({ companyId: z.coerce.number().int().positive().parse(companyId) }),
    stringify: ({ companyId }) => ({ companyId: String(companyId) }),
  },
  component: () => <LazyRoute page={CompanyDetailPage} />,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([indexRoute, ...pageRoutes, companyDetailRoute]),
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, defaultPreload: 'intent' });
}

export function createTestHistory(path: string) {
  return createMemoryHistory({ initialEntries: [path] });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
