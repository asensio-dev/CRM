// Guardia del pre-commit que complementa secretlint:
//  1. Bloquea versionar archivos .env y Excel/CSV con datos reales.
//  2. Bloquea contraseñas en cadenas de conexión SQL Server (`...;password=...`),
//     formato que secretlint no reconoce.
const git = (...args: string[]) => Bun.spawnSync(['git', ...args]).stdout.toString();

const forbiddenFile = /(^|\/)\.env(\.(?!example$)[^/]*)?$|\.(xlsx|xls)$|^data\//i;
const stagedFiles = git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
  .split('\n')
  .filter(Boolean);
const forbidden = stagedFiles.filter((file) => forbiddenFile.test(file));

const passwordInConnection = /;\s*(password|pwd)\s*=\s*(?!\$\{|<|\{|"?\s*$)[^;\s"'`]{6,}/i;
const leakedLines = git('diff', '--cached', '-U0', '--no-color')
  .split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .filter((line) => passwordInConnection.test(line));

if (forbidden.length > 0) {
  console.error(`Prohibido versionar: ${forbidden.join(', ')}`);
}
if (leakedLines.length > 0) {
  console.error('Posible contraseña en una cadena de conexión dentro de los cambios preparados.');
  console.error('Mueve el valor a backend/.env (ignorado por git) y vuelve a intentarlo.');
}
if (forbidden.length > 0 || leakedLines.length > 0) process.exit(1);
