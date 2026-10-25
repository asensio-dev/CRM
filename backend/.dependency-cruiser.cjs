/**
 * Reglas de la arquitectura hexagonal. Se ejecuta en CI y en pre-push (`bun run arch` desde la raíz).
 * domain ← application ← infrastructure
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'El dominio no conoce frameworks, ORM ni capas externas.',
      severity: 'error',
      from: { path: '(^|/)domain/' },
      to: {
        path: [
          '(^|/)(application|infrastructure)/',
          'node_modules/@nestjs',
          'node_modules/@prisma',
          'src/generated',
          'node_modules/express',
        ],
      },
    },
    {
      name: 'application-no-infrastructure',
      comment: 'Los casos de uso dependen de puertos, nunca de adaptadores.',
      severity: 'error',
      from: { path: '(^|/)application/' },
      to: { path: ['(^|/)infrastructure/', 'node_modules/@prisma', 'src/generated'] },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'Un módulo solo puede usar de otro lo que exporta en su index.ts (API pública del módulo).',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['src/generated', '\\.spec\\.ts$', '\\.test\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
