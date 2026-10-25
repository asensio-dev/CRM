import type { ApiError, LoginResponse } from '@axiom/contracts';

/** Error tipado que replica la forma `ApiError` de los contratos. */
export class HttpError extends Error implements ApiError {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'HttpError';
    this.statusCode = error.statusCode;
    this.code = error.code;
    this.details = error.details;
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  /** Se resuelve en cada llamada para poder sustituir `fetch` en tests. */
  fetchImpl?: () => typeof fetch;
  /** Se invoca cuando el refresh fracasa: la sesión ya no es válida. */
  onAuthFailure?: () => void;
  /** Se invoca tras un refresh correcto (para sincronizar el usuario). */
  onRefreshed?: (session: LoginResponse) => void;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** No intenta refresh en 401 (login / refresh). */
  skipAuthRetry?: boolean;
}

const NETWORK_ERROR: ApiError = {
  statusCode: 0,
  code: 'NETWORK_ERROR',
  message: 'No se pudo conectar con el servidor.',
};

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '/api';
  const doFetch = (input: string, init: RequestInit) =>
    (options.fetchImpl?.() ?? globalThis.fetch)(input, init);

  // El access token vive solo en memoria: nunca en localStorage/sessionStorage.
  let accessToken: string | null = null;
  let refreshing: Promise<LoginResponse> | null = null;

  async function parseError(res: Response): Promise<HttpError> {
    let body: Partial<ApiError> | null = null;
    try {
      body = (await res.json()) as Partial<ApiError>;
    } catch {
      body = null;
    }
    return new HttpError({
      statusCode: body?.statusCode ?? res.status,
      code: body?.code ?? `HTTP_${res.status}`,
      message: body?.message ?? res.statusText ?? 'Error inesperado.',
      details: body?.details,
    });
  }

  async function send(path: string, opts: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    // FormData: el navegador fija el Content-Type multipart con su boundary.
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body:
          opts.body === undefined
            ? undefined
            : isForm
              ? (opts.body as FormData)
              : JSON.stringify(opts.body),
        credentials: 'include',
        signal: opts.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new HttpError(NETWORK_ERROR);
    }
  }

  /** POST /auth/refresh; las llamadas concurrentes comparten una sola petición. */
  function refresh(): Promise<LoginResponse> {
    if (!refreshing) {
      refreshing = (async () => {
        const res = await send('/auth/refresh', { method: 'POST', skipAuthRetry: true });
        if (!res.ok) throw await parseError(res);
        const session = (await res.json()) as LoginResponse;
        accessToken = session.accessToken;
        options.onRefreshed?.(session);
        return session;
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let res = await send(path, opts);
    if (res.status === 401 && !opts.skipAuthRetry) {
      try {
        await refresh();
      } catch {
        accessToken = null;
        options.onAuthFailure?.();
        throw await parseError(res);
      }
      res = await send(path, opts);
    }
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    request,
    refresh,
    get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    setAccessToken(token: string | null) {
      accessToken = token;
    },
    getAccessToken: () => accessToken,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
