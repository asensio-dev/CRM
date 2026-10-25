import type { LoginResponse } from '@axiom/contracts';
import { createApiClient } from './client';

export { type ApiClient, createApiClient, HttpError } from './client';

type Listener<T> = (value: T) => void;

/** Canal desacoplado: `features/auth` se suscribe sin que `shared` dependa de él. */
export const sessionEvents = {
  authFailure: new Set<Listener<void>>(),
  refreshed: new Set<Listener<LoginResponse>>(),
};

export const api = createApiClient({
  onAuthFailure: () => {
    for (const l of sessionEvents.authFailure) l();
  },
  onRefreshed: (session) => {
    for (const l of sessionEvents.refreshed) l(session);
  },
});
