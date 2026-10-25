import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';

const TIME_ZONE = 'America/Managua';

const absolute = new Intl.DateTimeFormat('es-NI', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});

/** "24 oct 2026, 3:05 p. m." en hora de Managua. */
export function formatAbsolute(iso: string | Date): string {
  return absolute.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** "hace 3 días" / "dentro de 2 horas". */
export function formatRelative(iso: string | Date): string {
  return formatDistanceToNowStrict(typeof iso === 'string' ? new Date(iso) : iso, {
    addSuffix: true,
    locale: es,
  });
}

/** Valor de `<input type="datetime-local">` (hora local del navegador) → ISO UTC. */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}
