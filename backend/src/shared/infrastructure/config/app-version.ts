import pkg from '../../../../package.json' with { type: 'json' };

/** Versión de la API: única fuente de verdad = `backend/package.json`. */
export const APP_VERSION: string = pkg.version;
