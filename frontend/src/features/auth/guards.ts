import type { UserRole } from '@axiom/contracts';
import { redirect } from '@tanstack/react-router';
import { useSessionStore } from './session-store';

/** Solo permite redirecciones internas (evita open redirect). */
export function safeRedirect(target: unknown): string | undefined {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : undefined;
}

/** `beforeLoad` de rutas protegidas: sin sesión → /login conservando el destino. */
export function requireAuth(location: { href: string }) {
  if (useSessionStore.getState().status !== 'authenticated') {
    throw redirect({ to: '/login', search: { redirect: safeRedirect(location.href) } });
  }
}

/** `beforeLoad` de rutas restringidas por rol. */
export function requireRole(roles: readonly UserRole[]) {
  const { user } = useSessionStore.getState();
  if (!user || !roles.includes(user.role)) throw redirect({ to: '/mi-semana' });
}

/** `beforeLoad` de /login: quien ya tiene sesión va a la app. */
export function redirectIfAuthenticated(search: { redirect?: string }) {
  if (useSessionStore.getState().status === 'authenticated') {
    throw redirect({ to: safeRedirect(search.redirect) ?? '/mi-semana' });
  }
}
