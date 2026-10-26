import { useEffect, useState } from 'react';

/**
 * Devuelve `true` solo si `flag` sigue activo tras `delayMs`. Evita el parpadeo de los
 * indicadores de "actualizando" cuando la respuesta llega enseguida.
 */
export function useDelayedFlag(flag: boolean, delayMs = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [flag, delayMs]);
  return shown;
}
