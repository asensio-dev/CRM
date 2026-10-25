const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** Convierte '15m', '7d', '30s', '12h' a segundos. */
export function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) throw new Error(`TTL inválido: "${ttl}" (usa p. ej. 15m, 12h, 7d)`);
  return Number(match[1]) * (UNIT_SECONDS[match[2] as string] as number);
}
