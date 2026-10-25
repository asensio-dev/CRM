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
import type { ComponentType } from 'react';
import { z } from 'zod';
import { AppointmentsPage } from '@/features/appointments';
import { redirectIfAuthenticated, requireAuth, requireRole } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/login-page';
import { CompaniesPage } from '@/features/companies';
import { CompanyDetailPage } from '@/features/company-detail/company-detail-page';
import { DashboardPage } from '@/features/dashboard';
import { ImportPage } from '@/features/import';
import { MyWeekPage } from '@/features/my-week';
import { PipelinePage } from '@/features/pipeline';
import { PortfolioPage } from '@/features/portfolio';
import { UsersPage } from '@/features/users';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { PlaceholderPage } from '@/shared/ui/placeholder-page';
import { AppLayout } from './layout/app-layout';
import { NAV_ITEMS, type NavItem } from './navigation';

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
  '/mi-semana': MyWeekPage,
  '/cartera': PortfolioPage,
  '/pipeline': PipelinePage,
  '/tablero': DashboardPage,
  '/citas': AppointmentsPage,
  '/empresas': CompaniesPage,
  '/importacion': ImportPage,
  '/usuarios': UsersPage,
};

const pageRoutes = NAV_ITEMS.map((item) => {
  const page = PAGES[item.to];
  const Page = PAGE_COMPONENTS[item.to];
  return createRoute({
    getParentRoute: () => appRoute,
    path: item.to,
    beforeLoad: item.roles ? () => requireRole(item.roles ?? []) : undefined,
    component: Page
      ? () => <Page />
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
  component: CompanyDetailPage,
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
