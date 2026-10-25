/**
 * Integra la rama actual de un agente en `main`, de una rama a la vez.
 * Ejecutar DENTRO del worktree del agente, en su rama feat/..., con el árbol limpio:
 *
 *   bun scripts/integrate.ts
 *
 * Pasos: candado global → rebase sobre main → bun install → bun run verify →
 * merge --no-ff en el worktree de main → libera el candado.
 * Si el rebase tiene conflictos, el script se detiene (candado liberado); resuélvelos,
 * `git rebase --continue` y vuelve a ejecutarlo.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

function run(cmd: string[], cwd?: string): { code: number; out: string } {
  const p = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}`.trim() };
}
function must(cmd: string[], cwd?: string): string {
  const r = run(cmd, cwd);
  if (r.code !== 0) throw new Error(`${cmd.join(' ')} falló:\n${r.out}`);
  return r.out;
}
function stream(cmd: string[], cwd?: string): number {
  return Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' }).exitCode ?? 1;
}

const branch = must(['git', 'rev-parse', '--abbrev-ref', 'HEAD']);
if (branch === 'main' || branch === 'HEAD') {
  console.error('Ejecuta este script desde una rama de trabajo, no desde main.');
  process.exit(1);
}
if (must(['git', 'status', '--porcelain'])) {
  console.error('Hay cambios sin commitear. Haz commit antes de integrar.');
  process.exit(1);
}

const mainWorktree = must(['git', 'worktree', 'list', '--porcelain'])
  .split('\n\n')
  .find((block) => block.includes('branch refs/heads/main'))
  ?.match(/^worktree (.+)$/m)?.[1];
if (!mainWorktree) {
  console.error('No hay ningún worktree con main; no se puede integrar.');
  process.exit(1);
}

const commonDirRaw = must(['git', 'rev-parse', '--git-common-dir']);
const commonDir = isAbsolute(commonDirRaw) ? commonDirRaw : join(process.cwd(), commonDirRaw);
const lockDir = join(commonDir, 'axiom-integrate.lock');

const deadline = Date.now() + 45 * 60_000;
for (;;) {
  try {
    mkdirSync(lockDir); // atómico: solo un agente lo consigue
    await Bun.write(join(lockDir, 'owner'), `${branch} ${new Date().toISOString()}\n`);
    break;
  } catch {
    if (Date.now() > deadline) {
      console.error(`Candado ocupado más de 45 min (${lockDir}). Avisa al orquestador.`);
      process.exit(1);
    }
    console.log('Otra rama se está integrando; esperando 15 s…');
    await Bun.sleep(15_000);
  }
}

let exitCode = 0;
try {
  if (must(['git', 'status', '--porcelain'], mainWorktree)) {
    throw new Error(`El worktree de main (${mainWorktree}) tiene cambios sin commitear.`);
  }
  console.log(`▶ Rebase de ${branch} sobre main`);
  if (run(['git', 'rebase', 'main']).code !== 0) {
    throw new Error(
      'Conflictos en el rebase. Resuélvelos (bun.lock: quédate con el de main y ejecuta `bun install`), ' +
        '`git add` + `git rebase --continue`, y vuelve a ejecutar este script.',
    );
  }
  console.log('▶ bun install + bun run verify');
  if (stream(['bun', 'install']) !== 0) throw new Error('bun install falló');
  if (run(['git', 'status', '--porcelain']).out) {
    throw new Error('bun install modificó archivos (¿bun.lock?). Haz commit y vuelve a ejecutar.');
  }
  if (stream(['bun', 'run', 'verify']) !== 0) throw new Error('bun run verify falló');

  console.log(`▶ Merge --no-ff de ${branch} en main`);
  must(['git', 'merge', '--no-ff', branch, '-m', `Merge branch '${branch}'`], mainWorktree);
  console.log(`✔ ${branch} integrada en main: ${must(['git', 'rev-parse', '--short', 'main'])}`);
} catch (error) {
  console.error(`✖ ${(error as Error).message}`);
  exitCode = 2;
} finally {
  rmSync(lockDir, { recursive: true, force: true });
}
process.exit(exitCode);
