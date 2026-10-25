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
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TZ: z.string().default('America/Managua'),
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
