declare const __APP_VERSION__: string | undefined;

/** Versión de la app (package.json del frontend, inyectada por Vite con `define`). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
