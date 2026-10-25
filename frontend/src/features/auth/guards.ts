import type { UserRole } from '@axiom/contracts';
import { redirect } from '@tanstack/react-router';
import { useSessionStore } from './session-store';

/**
 * Solo permite redirecciones internas (evita open redirect). Además de `//host`, rechaza `/\host`
 * (los navegadores tratan `\` como `/`) y caracteres de control/espacios que el parser de URL elimina.
 */
export function safeRedirect(target: unknown): string | undefined {
  if (typeof target !== 'string' || target.length > 2048) return undefined;
  if (!target.startsWith('/') || target.startsWith('//')) return undefined;
  if (target.includes('\\') || /[\s\p{Cc}]/u.test(target)) return undefined;
  return target;
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
