const pageLoaders: (() => Promise<unknown>)[] = [];

/** Registra la carga diferida de una pantalla (la llama `lazyPage` en el router). */
export function registerPageLoader(load: () => Promise<unknown>): void {
  pageLoaders.push(load);
}

/**
 * Descarga en segundo plano el código de todas las pantallas (tras iniciar sesión), para que
 * navegar no tenga que esperar al chunk y el esqueleto de transición casi nunca se vea.
 */
export function prefetchPages(): void {
  for (const load of pageLoaders) void load().catch(() => undefined);
}
