import { z } from 'zod';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const LIMIT_STEP = 20;

/**
 * Parámetros de URL de /pipeline. El router parsea JSON ("123" llega como número), así que
 * cada campo se normaliza y los inválidos se descartan sin romper la página.
 */
export const pipelineSearchSchema = z.object({
  q: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().min(1).max(100))
    .optional()
    .catch(undefined),
  sectorId: z.coerce.number().int().positive().optional().catch(undefined),
  activityId: z.coerce.number().int().positive().optional().catch(undefined),
  limitPerColumn: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .catch(DEFAULT_LIMIT),
});
export type PipelineSearch = z.infer<typeof pipelineSearchSchema>;
