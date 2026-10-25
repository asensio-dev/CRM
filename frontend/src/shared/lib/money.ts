/**
 * Dinero: los montos viajan como string decimal ("1500.50"). Nunca se convierten con parseFloat para
 * calcular; para mostrarlos se agrupan los miles sobre el texto (exacto aunque supere 2^53).
 */
const parts = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2 }).formatToParts(1234567.5);
const GROUP = parts.find((p) => p.type === 'group')?.value ?? ',';
const DECIMAL = parts.find((p) => p.type === 'decimal')?.value ?? '.';

const SYMBOLS: Record<string, string> = { NIO: 'C$', USD: 'US$' };

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency;
}

/** "1500.5" → "1,500.50" (sin símbolo). Texto no decimal se devuelve tal cual. */
export function formatDecimalString(amount: string | number): string {
  const text = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!m) return text;
  const [, sign = '', int = '0', frac = ''] = m;
  const intPart = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  return `${sign}${intPart}${DECIMAL}${frac.padEnd(2, '0').slice(0, 2)}`;
}

/** "C$ 1,500.50" / "US$ 2,000.00". */
export function formatMoney(amount: string | number, currency: string): string {
  return `${currencySymbol(currency)} ${formatDecimalString(amount)}`;
}
