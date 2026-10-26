/**
 * Prueba de carga HTTP de la API (entorno QA, ver docs/qa.md). Usa fetch de Bun con N usuarios
 * virtuales concurrentes repartidos entre los usuarios QA (10 EJECUTIVO + 2 SUPERVISOR), que
 * ejecutan una mezcla ponderada de lecturas (~90 %) y escrituras (~10 %) sobre su propia cartera.
 *
 *   bun scripts/qa-env.ts run -- bun scripts/load-test.ts [run] [--levels 1,10,30]
 *       [--duration 30] [--warmup 5] [--base http://localhost:3100/api] [--out <archivo.json>]
 *       [--only companies.,pipeline.board] [--think 0]
 *   bun scripts/qa-env.ts run -- bun scripts/load-test.ts prime
 *       Siembra citas y contratos (vía API, idempotente) para que esos listados tengan volumen.
 *
 * Credenciales: QA_USER_PASSWORD del entorno (backend/.env.qa). La API debe correr con
 * TRUST_PROXY=loopback: cada usuario virtual envía su propio X-Forwarded-For, como haría un proxy,
 * para no compartir el límite de 5 logins/min por IP. Imprime solo cifras agregadas.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    levels: { type: 'string', default: '1,10,30' },
    duration: { type: 'string', default: '30' },
    warmup: { type: 'string', default: '5' },
    base: { type: 'string' },
    out: { type: 'string' },
    only: { type: 'string' },
    /** Pausa media entre peticiones de un usuario (ms, ±50 %). 0 = bucle cerrado sin pausa. */
    think: { type: 'string', default: '0' },
  },
});
const THINK_MS = Math.max(0, Number.parseInt(args.think as string, 10) || 0);
const mode = positionals[0] ?? 'run';
const BASE =
  (args.base as string | undefined) ?? `http://localhost:${process.env.PORT ?? '3100'}/api`;
const PASSWORD = process.env.QA_USER_PASSWORD;
if (!PASSWORD) {
  console.error('Falta QA_USER_PASSWORD: ejecuta con `bun scripts/qa-env.ts run -- …`.');
  process.exit(1);
}

const EMAILS = [
  ...Array.from({ length: 10 }, (_, i) => `qa.ejecutivo${String(i + 1).padStart(2, '0')}@axiom.qa`),
  'qa.supervisor1@axiom.qa',
  'qa.supervisor2@axiom.qa',
];
/** Palabras genéricas de razones sociales (no son datos de ninguna empresa concreta). */
const TERMS = [
  'ferreteria',
  'farmacia',
  'comercial',
  'servicios',
  'distribuidora',
  'inversiones',
  'grupo',
  'taller',
  'restaurante',
  'clinica',
  'transporte',
  'construccion',
  'agro',
  'nica',
  'sociedad',
];
const STATUSES = ['CON_RESPUESTA', 'SIN_RESPUESTA', 'AGENDANDO_CITA', 'POR_CONTACTAR'];

interface Session {
  email: string;
  ip: string;
  token: string;
  userId: number;
  role: string;
  /** Empresas de su cartera (ejecutivo) o una muestra (supervisor). */
  companies: number[];
  planItems: { itemId: number; companyId: number }[];
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const pickOne = <T>(xs: readonly T[]): T => xs[rnd(xs.length)] as T;

async function call(
  s: Pick<Session, 'token' | 'ip'>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; ms: number; json: unknown }> {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${s.token}`,
      'x-forwarded-for': s.ip,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const ms = performance.now() - started;
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, ms, json };
}

async function login(email: string, i: number): Promise<Session> {
  const ip = `10.77.0.${i + 1}`;
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${email} → HTTP ${res.status}`);
  }
  const data = (await res.json()) as { accessToken: string; user: { id: number; role: string } };
  return {
    email,
    ip,
    token: data.accessToken,
    userId: data.user.id,
    role: data.user.role,
    companies: [],
    planItems: [],
  };
}

async function loadContext(s: Session) {
  if (s.role === 'EJECUTIVO') {
    const week = await call(s, 'GET', '/portfolio/my-week');
    const items = ((week.json as { items?: { itemId: number; companyId: number }[] })?.items ??
      []) as { itemId: number; companyId: number }[];
    s.planItems = items.map((x) => ({ itemId: x.itemId, companyId: x.companyId }));
    const ids = new Set(items.map((x) => x.companyId));
    const asg = await call(s, 'GET', '/portfolio/assignments?pageSize=100');
    for (const a of ((asg.json as { items?: { companyId: number }[] })?.items ?? []) as {
      companyId: number;
    }[])
      ids.add(a.companyId);
    s.companies = [...ids];
  } else {
    const ids = new Set<number>();
    for (let k = 0; k < 4; k++) {
      const page = 1 + rnd(4000);
      const r = await call(s, 'GET', `/companies?page=${page}&pageSize=25`);
      for (const c of ((r.json as { items?: { id: number }[] })?.items ?? []) as { id: number }[])
        ids.add(c.id);
    }
    s.companies = [...ids];
  }
}

// ───────────────────────────── escenario ─────────────────────────────

type Op = {
  name: string;
  weight: number;
  write?: boolean;
  run: (s: Session, ctx: { sectors: number[] }) => Promise<{ status: number; ms: number } | null>;
};

const companyOf = (s: Session) => (s.companies.length ? pickOne(s.companies) : null);

const OPS: Op[] = [
  {
    name: 'companies.list',
    weight: 8,
    run: (s) => call(s, 'GET', '/companies?page=1&pageSize=25'),
  },
  {
    name: 'companies.search.q',
    weight: 10,
    run: (s) => call(s, 'GET', `/companies?q=${pickOne(TERMS)}&page=1&pageSize=25`),
  },
  {
    name: 'companies.filter.sort',
    weight: 6,
    run: (s, { sectors }) =>
      call(
        s,
        'GET',
        `/companies?sectorId=${pickOne(sectors)}&status=${pickOne(STATUSES)}&hasPhone=true` +
          `&sortBy=${pickOne(['employeeCount', 'lastContactAt', 'legalName'])}&sortDir=desc&page=1&pageSize=25`,
      ),
  },
  {
    name: 'companies.deep.page',
    weight: 3,
    run: (s) => call(s, 'GET', `/companies?page=${2000 + rnd(2100)}&pageSize=25`),
  },
  {
    name: 'companies.detail',
    weight: 8,
    run: async (s) => {
      const id = companyOf(s);
      return id ? call(s, 'GET', `/companies/${id}`) : null;
    },
  },
  { name: 'pipeline.board', weight: 8, run: (s) => call(s, 'GET', '/pipeline/board') },
  {
    name: 'pipeline.board.q',
    weight: 3,
    run: (s) => call(s, 'GET', `/pipeline/board?q=${pickOne(TERMS)}`),
  },
  {
    name: 'pipeline.timeline',
    weight: 6,
    run: async (s) => {
      const id = companyOf(s);
      return id ? call(s, 'GET', `/pipeline/companies/${id}/timeline`) : null;
    },
  },
  { name: 'portfolio.my-week', weight: 8, run: (s) => call(s, 'GET', '/portfolio/my-week') },
  {
    name: 'portfolio.cycles.current',
    weight: 3,
    run: (s) => call(s, 'GET', '/portfolio/cycles/current'),
  },
  {
    name: 'portfolio.assignments',
    weight: 3,
    run: (s) => call(s, 'GET', '/portfolio/assignments?page=1&pageSize=25'),
  },
  { name: 'analytics.summary', weight: 3, run: (s) => call(s, 'GET', '/analytics/summary') },
  {
    name: 'analytics.summary.sector',
    weight: 2,
    run: (s, { sectors }) => call(s, 'GET', `/analytics/summary?sectorId=${pickOne(sectors)}`),
  },
  { name: 'analytics.funnel', weight: 2, run: (s) => call(s, 'GET', '/analytics/funnel') },
  {
    name: 'analytics.weekly-activity',
    weight: 2,
    run: (s) => call(s, 'GET', '/analytics/weekly-activity?weeks=12'),
  },
  { name: 'analytics.executives', weight: 2, run: (s) => call(s, 'GET', '/analytics/executives') },
  {
    name: 'analytics.cycle-coverage',
    weight: 2,
    run: (s) => call(s, 'GET', '/analytics/cycle-coverage'),
  },
  {
    name: 'appointments.list',
    weight: 3,
    run: (s) => call(s, 'GET', '/appointments?page=1&pageSize=25'),
  },
  {
    name: 'contracts.list',
    weight: 3,
    run: (s) => call(s, 'GET', '/contracts?page=1&pageSize=25'),
  },
  {
    name: 'write.interaction',
    weight: 6,
    write: true,
    run: async (s) => {
      if (s.role !== 'EJECUTIVO') return null;
      const item = s.planItems.length ? pickOne(s.planItems) : null;
      const companyId = item?.companyId ?? companyOf(s);
      if (!companyId) return null;
      return call(s, 'POST', `/pipeline/companies/${companyId}/interactions`, {
        channel: pickOne(['LLAMADA', 'WHATSAPP', 'CORREO']),
        outcome: pickOne(['NO_CONTESTO', 'CONTESTO', 'VOLVER_A_LLAMAR']),
        notes: 'Prueba de carga QA',
        ...(item ? { planItemId: item.itemId } : {}),
      });
    },
  },
  {
    name: 'write.status',
    weight: 3,
    write: true,
    run: async (s) => {
      if (s.role !== 'EJECUTIVO') return null;
      const id = companyOf(s);
      if (!id) return null;
      const state = await call(s, 'GET', `/pipeline/companies/${id}`);
      const st = state.json as { version?: number; allowedNextStatuses?: string[] } | null;
      const options = (st?.allowedNextStatuses ?? []).filter(
        (x) => !['DESCARTADO', 'CONTRATO_ACTIVO', 'POR_CONTACTAR'].includes(x),
      );
      if (state.status !== 200 || options.length === 0) return null;
      return call(s, 'POST', `/pipeline/companies/${id}/status`, {
        to: pickOne(options),
        note: 'Prueba de carga QA',
        expectedVersion: st?.version,
      });
    },
  },
];

interface Stat {
  lat: number[];
  codes: Record<string, number>;
}

function pct(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

async function runLevel(
  sessions: Session[],
  ops: Op[],
  concurrency: number,
  seconds: number,
  ctx: { sectors: number[] },
  record: boolean,
) {
  const stats = new Map<string, Stat>();
  const total = ops.reduce((a, o) => a + o.weight, 0);
  const choose = () => {
    let r = Math.random() * total;
    for (const o of ops) {
      r -= o.weight;
      if (r < 0) return o;
    }
    return ops[ops.length - 1] as Op;
  };
  const end = performance.now() + seconds * 1000;
  let requests = 0;
  const vu = async (i: number) => {
    const s = sessions[i % sessions.length] as Session;
    while (performance.now() < end) {
      const op = choose();
      let r: { status: number; ms: number } | null;
      try {
        r = await op.run(s, ctx);
      } catch {
        r = { status: 0, ms: 0 };
      }
      if (!r) continue;
      requests++;
      if (THINK_MS > 0) await Bun.sleep(THINK_MS * (0.5 + Math.random()));
      if (!record) continue;
      const st = stats.get(op.name) ?? { lat: [], codes: {} };
      st.lat.push(r.ms);
      const k = String(r.status);
      st.codes[k] = (st.codes[k] ?? 0) + 1;
      stats.set(op.name, st);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, (_, i) => vu(i)));
  return { stats, requests };
}

function summarize(stats: Map<string, Stat>, seconds: number) {
  const rows = [...stats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, st]) => {
      const sorted = [...st.lat].sort((a, b) => a - b);
      const n = sorted.length;
      const fiveXX = Object.entries(st.codes)
        .filter(([c]) => c === '0' || c.startsWith('5'))
        .reduce((a, [, v]) => a + v, 0);
      const fourXX = Object.entries(st.codes)
        .filter(([c]) => c.startsWith('4'))
        .reduce((a, [, v]) => a + v, 0);
      return {
        name,
        n,
        rps: +(n / seconds).toFixed(1),
        p50: Math.round(pct(sorted, 50)),
        p95: Math.round(pct(sorted, 95)),
        p99: Math.round(pct(sorted, 99)),
        max: Math.round(sorted[n - 1] ?? 0),
        err4xx: fourXX,
        err5xx: fiveXX,
        codes: st.codes,
      };
    });
  return rows;
}

// ───────────────────────────── prime ─────────────────────────────

async function prime(sessions: Session[]) {
  const sup = sessions.find((s) => s.role === 'SUPERVISOR') as Session;
  const execs = sessions.filter((s) => s.role === 'EJECUTIVO');
  const existing = (await call(sup, 'GET', '/appointments?pageSize=1')).json as { total?: number };
  if ((existing?.total ?? 0) > 0) {
    console.log(`Ya hay ${existing.total} citas: prime omitido (idempotente).`);
    return;
  }
  const idsByStatus = async (status: string, max: number) => {
    const ids: number[] = [];
    for (let page = 1; ids.length < max; page++) {
      const r = await call(sup, 'GET', `/companies?status=${status}&page=${page}&pageSize=100`);
      const items = ((r.json as { items?: { id: number }[] })?.items ?? []) as { id: number }[];
      ids.push(...items.map((c) => c.id));
      if (items.length < 100) break;
    }
    return ids.slice(0, max);
  };
  const codes: Record<string, number> = {};
  const count = (k: string, status: number) => {
    const key = `${k} ${status}`;
    codes[key] = (codes[key] ?? 0) + 1;
  };
  const day = 86_400_000;
  // Citas: empresas AGENDANDO_CITA (ya listas) repartidas entre ejecutivos, pasado y futuro cercano
  for (const [i, companyId] of (await idsByStatus('AGENDANDO_CITA', 450)).entries()) {
    const owner = execs[i % execs.length] as Session;
    const when = new Date(Date.now() + (1 + rnd(30)) * day + rnd(8) * 3_600_000);
    const r = await call(sup, 'POST', '/appointments', {
      companyId,
      scheduledAt: when.toISOString(),
      mode: pickOne(['VIRTUAL', 'TELEFONICA']),
      userId: owner.userId,
      notes: 'Cita QA',
    });
    count('appointments.create', r.status);
  }
  // Contratos: empresas EN_PROCESO_CONTRATO y CONTRATO_ACTIVO
  const today = new Date().toISOString().slice(0, 10);
  for (const status of ['EN_PROCESO_CONTRATO', 'CONTRATO_ACTIVO']) {
    for (const companyId of await idsByStatus(status, 300)) {
      const r = await call(sup, 'POST', '/contracts', {
        companyId,
        startDate: today,
        amount: String(1000 + rnd(50_000)),
        currency: pickOne(['NIO', 'USD']),
      });
      count(`contracts.create(${status})`, r.status);
      const id = (r.json as { id?: number })?.id;
      if (id && rnd(2) === 0) {
        count(
          'contracts.status',
          (await call(sup, 'POST', `/contracts/${id}/status`, { to: 'ENVIADO' })).status,
        );
      }
    }
  }
  console.log('Prime (cifras agregadas):');
  for (const [k, v] of Object.entries(codes).sort()) console.log(`  ${k}: ${v}`);
}

// ───────────────────────────── main ─────────────────────────────

const sessions: Session[] = [];
for (const [i, email] of EMAILS.entries()) sessions.push(await login(email, i));

if (mode === 'prime') {
  await prime(sessions);
  process.exit(0);
}

await Promise.all(sessions.map(loadContext));
const sectorsRes = await call(sessions[0] as Session, 'GET', '/catalogs/sectors');
const sectors = ((sectorsRes.json as { id: number }[]) ?? []).map((s) => s.id);
const ctx = { sectors: sectors.length ? sectors : [1] };
const only = (args.only as string | undefined)?.split(',').filter(Boolean);
const ops = only ? OPS.filter((o) => only.some((p) => o.name.startsWith(p))) : OPS;

const levels = (args.levels as string).split(',').map((x) => Number.parseInt(x, 10));
const duration = Number.parseInt(args.duration as string, 10);
const warmup = Number.parseInt(args.warmup as string, 10);
console.log(
  `Base ${BASE} · ${sessions.length} usuarios · empresas en contexto: ${sessions
    .map((s) => s.companies.length)
    .join('/')} · ${ops.length} operaciones · ${duration}s por nivel (+${warmup}s calentamiento)` +
    (THINK_MS > 0 ? ` · pausa ~${THINK_MS} ms` : ' · sin pausa (bucle cerrado)'),
);

const report: Record<string, unknown> = {
  base: BASE,
  duration,
  warmup,
  thinkMs: THINK_MS,
  levels: {},
};
for (const c of levels) {
  if (warmup > 0) await runLevel(sessions, ops, c, warmup, ctx, false);
  const started = performance.now();
  const { stats, requests } = await runLevel(sessions, ops, c, duration, ctx, true);
  const elapsed = (performance.now() - started) / 1000;
  const rows = summarize(stats, elapsed);
  (report.levels as Record<string, unknown>)[String(c)] = { requests, elapsed, rows };
  const reads = rows.filter((r) => !r.name.startsWith('write.'));
  const writes = rows.filter((r) => r.name.startsWith('write.'));
  const worst = (xs: typeof rows) => Math.max(0, ...xs.map((r) => r.p95));
  console.log(
    `\n## ${c} usuarios concurrentes — ${requests} peticiones en ${elapsed.toFixed(1)} s ` +
      `(${(requests / elapsed).toFixed(1)} req/s) · peor p95 lectura ${worst(reads)} ms · ` +
      `peor p95 escritura ${worst(writes)} ms · 5xx ${rows.reduce((a, r) => a + r.err5xx, 0)}`,
  );
  console.log('| Endpoint | n | req/s | p50 | p95 | p99 | máx | 4xx | 5xx |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(
      `| ${r.name} | ${r.n} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.err4xx} | ${r.err5xx} |`,
    );
  }
  const odd = rows.filter((r) => r.err4xx > 0 || r.err5xx > 0);
  for (const r of odd) console.log(`  códigos ${r.name}: ${JSON.stringify(r.codes)}`);
}
if (args.out) writeFileSync(args.out as string, JSON.stringify(report, null, 2));
process.exit(0);
