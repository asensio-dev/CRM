// Valida que el mensaje de commit siga Conventional Commits: tipo(alcance): descripción
// Sin argumento (lefthook no entrecomilla {1} y rompe con rutas con espacios) se resuelve solo.
const file =
  process.argv[2] ??
  (
    await new Response(
      Bun.spawn(['git', 'rev-parse', '--git-path', 'COMMIT_EDITMSG']).stdout,
    ).text()
  ).trim();
if (!file) process.exit(0);

const firstLine = (await Bun.file(file).text()).split('\n')[0] ?? '';
const pattern =
  /^(feat|fix|chore|docs|test|refactor|perf|build|ci|style|revert)(\([a-z0-9-]+\))?!?: .{3,}/;

if (!pattern.test(firstLine) && !firstLine.startsWith('Merge ')) {
  console.error(`Mensaje de commit inválido: "${firstLine}"`);
  console.error('Formato esperado: feat(pipeline): add state transition rules');
  process.exit(1);
}
