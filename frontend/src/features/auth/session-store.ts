import type { AuthUser, LoginRequest, LoginResponse } from '@axiom/contracts';
import { create } from 'zustand';
import { api, sessionEvents } from '@/shared/api';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  setSession: (session: LoginResponse) => void;
  clear: () => void;
  /** Restaura la sesión con una renovación silenciosa (cookie httpOnly). */
  restore: () => Promise<void>;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  setSession: (session) => set({ status: 'authenticated', user: session.user }),
  clear: () => {
    api.setAccessToken(null);
    set({ status: 'anonymous', user: null });
  },
  restore: async () => {
    try {
      await api.refresh(); // `onRefreshed` actualiza el store
    } catch {
      get().clear();
    }
  },
  login: async (credentials) => {
    const session = await api.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: credentials,
      skipAuthRetry: true,
    });
    api.setAccessToken(session.accessToken);
    get().setSession(session);
  },
  logout: async () => {
    try {
      await api.post<void>('/auth/logout');
    } catch {
      // Cerramos la sesión local aunque el servidor no responda.
    }
    get().clear();
  },
}));

sessionEvents.refreshed.add((session) => useSessionStore.getState().setSession(session));
sessionEvents.authFailure.add(() => useSessionStore.getState().clear());
