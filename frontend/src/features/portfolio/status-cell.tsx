import { formatAbsolute, formatRelative } from '@/shared/lib/format-date';

/** "hace 3 días" con la fecha exacta como tooltip, o "Sin contacto". */
export function LastContact({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">Sin contacto</span>;
  return (
    <time dateTime={iso} title={formatAbsolute(iso)}>
      {formatRelative(iso)}
    </time>
  );
}
