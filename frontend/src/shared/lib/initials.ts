/** Iniciales para avatares: primera letra de la primera y la última palabra, ignorando "(demo)", cifras, etc. */
export function initials(fullName: string): string {
  const words = fullName
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
