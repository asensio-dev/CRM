import { z } from 'zod';

/**
 * Variables de entorno validadas al arrancar. Si falta un secreto la app NO inicia:
 * nunca hay valores por defecto para credenciales.
 */
export const EnvSchema = z.object({
  DATABASE_URL: z.string().startsWith('sqlserver://'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Con credenciales (cookie de refresh) el origen debe ser explícito: nunca '*'.
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .refine((v) => !v.split(',').some((o) => o.trim() === '*'), 'CORS_ORIGIN no puede ser *'),
  TZ: z.string().default('America/Managua'),
  /**
   * Detrás de un proxy inverso (nginx, IIS, Azure…): valor de `trust proxy` de Express para que
   * `req.ip` (rate limit del login) sea la IP real del cliente y no la del proxy. Número de saltos
   * (`1`), o lista de IPs/subredes de confianza (`loopback`, `10.0.0.0/8`). Sin definir = no se
   * confía en `X-Forwarded-For` (correcto si la API se expone directamente).
   */
  TRUST_PROXY: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().optional(),
    )
    .transform((v) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : v))
    .refine((v) => v !== 'true', 'TRUST_PROXY=true confía en cualquier X-Forwarded-For')
    .optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const APP_CONFIG = Symbol('AppConfig');

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Solo se muestran los NOMBRES de las variables inválidas, nunca sus valores.
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuración inválida o incompleta: ${names}. Revisa backend/.env`);
  }
  return parsed.data;
}
