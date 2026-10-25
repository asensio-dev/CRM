import { Prisma } from '../../../../generated/prisma/client';
import type { AnalyticsScope } from '../../application/queries/read-ports';
import { MANAGUA_OFFSET_MINUTES, type UtcRange } from '../../application/time/managua-time';

/**
 * Constructores de SQL de analytics. Toda entrada va como parámetro (@P1…) mediante Prisma.sql;
 * nunca se concatena texto del usuario. Las fechas viajan como instantes UTC.
 */

const sectorJoin = (scope: AnalyticsScope, companyId: Prisma.Sql): Prisma.Sql =>
  scope.sectorId === undefined
    ? Prisma.empty
    : Prisma.sql`INNER JOIN [dbo].[companies] sc ON sc.[id] = ${companyId} AND sc.[sectorId] = ${scope.sectorId}`;

const between = (column: Prisma.Sql, range: UtcRange): Prisma.Sql[] => {
  const parts: Prisma.Sql[] = [];
  if (range.from) parts.push(Prisma.sql`${column} >= ${range.from}`);
  if (range.to) parts.push(Prisma.sql`${column} < ${range.to}`);
  return parts;
};

const whereAll = (conditions: Prisma.Sql[]): Prisma.Sql =>
  conditions.length === 0 ? Prisma.empty : Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

export function settingsSql(keys: readonly string[]): Prisma.Sql {
  return Prisma.sql`SELECT [key] AS [key], [value] AS [value] FROM [dbo].[settings] WHERE [key] IN (${Prisma.join(keys)})`;
}

export function currentCycleSql(today: string): Prisma.Sql {
  return Prisma.sql`
    SELECT TOP (1) [id], [number], [startDate], [endDate]
    FROM [dbo].[rotation_cycles]
    WHERE [startDate] <= CAST(${today} AS date) AND ([endDate] >= CAST(${today} AS date) OR [closedAt] IS NULL)
    ORDER BY CASE WHEN [endDate] >= CAST(${today} AS date) THEN 0 ELSE 1 END, [number] DESC`;
}

export function activeExecutivesSql(scope: AnalyticsScope): Prisma.Sql {
  const user = scope.userId === undefined ? Prisma.empty : Prisma.sql`AND u.[id] = ${scope.userId}`;
  return Prisma.sql`
    SELECT u.[id], u.[fullName] FROM [dbo].[users] u
    WHERE u.[role] = ${'EJECUTIVO'} AND u.[isActive] = 1 ${user}
    ORDER BY u.[fullName], u.[id]`;
}

/** Empresas por estado; con `userId`, solo las de su cartera activa. */
export function companiesByStatusSql(scope: AnalyticsScope): Prisma.Sql {
  const portfolio =
    scope.userId === undefined
      ? Prisma.empty
      : Prisma.sql`INNER JOIN [dbo].[portfolio_assignments] pa ON pa.[companyId] = c.[id] AND pa.[releasedAt] IS NULL AND pa.[userId] = ${scope.userId}`;
  const conditions =
    scope.sectorId === undefined ? [] : [Prisma.sql`c.[sectorId] = ${scope.sectorId}`];
  return Prisma.sql`
    SELECT c.[status] AS [status], COUNT(*) AS [total]
    FROM [dbo].[companies] c ${portfolio} ${whereAll(conditions)}
    GROUP BY c.[status]`;
}

export function reachedByStatusSql(scope: AnalyticsScope, period: UtcRange): Prisma.Sql {
  const conditions = between(Prisma.sql`h.[changedAt]`, period);
  if (scope.userId !== undefined) conditions.push(Prisma.sql`h.[userId] = ${scope.userId}`);
  return Prisma.sql`
    SELECT h.[toStatus] AS [status], COUNT(DISTINCT h.[companyId]) AS [total]
    FROM [dbo].[status_history] h ${sectorJoin(scope, Prisma.sql`h.[companyId]`)}
    ${whereAll(conditions)}
    GROUP BY h.[toStatus]`;
}

/** Pares (ejecutivo activo, empresa) distintos con interacción en el rango. */
export function contactPairsSql(scope: AnalyticsScope, range: UtcRange): Prisma.Sql {
  const conditions = between(Prisma.sql`i.[occurredAt]`, range);
  if (scope.userId !== undefined) conditions.push(Prisma.sql`i.[userId] = ${scope.userId}`);
  conditions.push(Prisma.sql`u.[role] = ${'EJECUTIVO'}`, Prisma.sql`u.[isActive] = 1`);
  return Prisma.sql`
    SELECT COUNT(*) AS [total] FROM (
      SELECT DISTINCT i.[userId], i.[companyId]
      FROM [dbo].[interactions] i
      INNER JOIN [dbo].[users] u ON u.[id] = i.[userId]
      ${sectorJoin(scope, Prisma.sql`i.[companyId]`)}
      ${whereAll(conditions)}
    ) d`;
}

export function appointmentsSql(scope: AnalyticsScope, range: UtcRange): Prisma.Sql {
  const conditions = [
    ...between(Prisma.sql`a.[scheduledAt]`, range),
    Prisma.sql`a.[status] <> ${'CANCELADA'}`,
  ];
  if (scope.userId !== undefined) conditions.push(Prisma.sql`a.[userId] = ${scope.userId}`);
  return Prisma.sql`
    SELECT COUNT(*) AS [total] FROM [dbo].[appointments] a
    ${sectorJoin(scope, Prisma.sql`a.[companyId]`)} ${whereAll(conditions)}`;
}

export function activeContractsSql(scope: AnalyticsScope): Prisma.Sql {
  const conditions = [Prisma.sql`k.[status] = ${'ACTIVO'}`];
  if (scope.userId !== undefined) conditions.push(Prisma.sql`k.[createdById] = ${scope.userId}`);
  return Prisma.sql`
    SELECT k.[currency] AS [currency], COUNT(*) AS [total], SUM(k.[amount]) AS [amount]
    FROM [dbo].[contracts] k ${sectorJoin(scope, Prisma.sql`k.[companyId]`)}
    ${whereAll(conditions)}
    GROUP BY k.[currency] ORDER BY k.[currency]`;
}

/** Índice de semana (0 = la de `anchorDay`) del instante, según el día de Managua. */
const weekIndex = (anchorDay: string): Prisma.Sql =>
  Prisma.sql`(DATEDIFF(DAY, CAST(${anchorDay} AS date), CAST(DATEADD(MINUTE, ${MANAGUA_OFFSET_MINUTES}, i.[occurredAt]) AS date)) / 7)`;

function activityFilter(scope: AnalyticsScope, range: UtcRange) {
  const conditions = between(Prisma.sql`i.[occurredAt]`, range);
  if (scope.userId !== undefined) conditions.push(Prisma.sql`i.[userId] = ${scope.userId}`);
  return {
    join: sectorJoin(scope, Prisma.sql`i.[companyId]`),
    where: whereAll(conditions),
  };
}

export function weeklyOutcomesSql(scope: AnalyticsScope, range: UtcRange, anchorDay: string) {
  const f = activityFilter(scope, range);
  return Prisma.sql`
    SELECT w.[week] AS [week], i.[outcome] AS [outcome], COUNT(*) AS [total]
    FROM [dbo].[interactions] i ${f.join}
    CROSS APPLY (SELECT ${weekIndex(anchorDay)} AS [week]) w
    ${f.where}
    GROUP BY w.[week], i.[outcome]`;
}

export function weeklyCompaniesSql(scope: AnalyticsScope, range: UtcRange, anchorDay: string) {
  const f = activityFilter(scope, range);
  return Prisma.sql`
    SELECT w.[week] AS [week], COUNT(DISTINCT i.[companyId]) AS [total]
    FROM [dbo].[interactions] i ${f.join}
    CROSS APPLY (SELECT ${weekIndex(anchorDay)} AS [week]) w
    ${f.where}
    GROUP BY w.[week]`;
}

export function weeklyByExecutiveSql(scope: AnalyticsScope, range: UtcRange, anchorDay: string) {
  const f = activityFilter(scope, range);
  return Prisma.sql`
    SELECT w.[week] AS [week], i.[userId] AS [userId], u.[fullName] AS [fullName],
           COUNT(*) AS [interactions], COUNT(DISTINCT i.[companyId]) AS [companies]
    FROM [dbo].[interactions] i
    INNER JOIN [dbo].[users] u ON u.[id] = i.[userId] ${f.join}
    CROSS APPLY (SELECT ${weekIndex(anchorDay)} AS [week]) w
    ${f.where}
    GROUP BY w.[week], i.[userId], u.[fullName]`;
}

// ─────────── Métricas por ejecutivo (filas agrupadas por userId) ───────────

export function assignedByUserSql(scope: AnalyticsScope): Prisma.Sql {
  const conditions = [Prisma.sql`pa.[releasedAt] IS NULL`];
  if (scope.userId !== undefined) conditions.push(Prisma.sql`pa.[userId] = ${scope.userId}`);
  return Prisma.sql`
    SELECT pa.[userId] AS [userId], COUNT(*) AS [total]
    FROM [dbo].[portfolio_assignments] pa ${sectorJoin(scope, Prisma.sql`pa.[companyId]`)}
    ${whereAll(conditions)} GROUP BY pa.[userId]`;
}

export function contactedByUserSql(scope: AnalyticsScope, range: UtcRange): Prisma.Sql {
  const conditions = between(Prisma.sql`i.[occurredAt]`, range);
  if (scope.userId !== undefined) conditions.push(Prisma.sql`i.[userId] = ${scope.userId}`);
  return Prisma.sql`
    SELECT i.[userId] AS [userId], COUNT(DISTINCT i.[companyId]) AS [total]
    FROM [dbo].[interactions] i ${sectorJoin(scope, Prisma.sql`i.[companyId]`)}
    ${whereAll(conditions)} GROUP BY i.[userId]`;
}

/** Empresas de la cartera activa con al menos una interacción propia dentro del ciclo. */
export function contactedInCycleByUserSql(scope: AnalyticsScope, cycle: UtcRange): Prisma.Sql {
  const conditions = [Prisma.sql`pa.[releasedAt] IS NULL`];
  if (scope.userId !== undefined) conditions.push(Prisma.sql`pa.[userId] = ${scope.userId}`);
  const inCycle = between(Prisma.sql`i.[occurredAt]`, cycle);
  conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM [dbo].[interactions] i
      WHERE i.[companyId] = pa.[companyId] AND i.[userId] = pa.[userId] AND ${Prisma.join(inCycle, ' AND ')}
    )`);
  return Prisma.sql`
    SELECT pa.[userId] AS [userId], COUNT(*) AS [total]
    FROM [dbo].[portfolio_assignments] pa ${sectorJoin(scope, Prisma.sql`pa.[companyId]`)}
    ${whereAll(conditions)}
    GROUP BY pa.[userId]`;
}

/** Orden en el camino principal; SIN_RESPUESTA comparte rango con CONTACTADO. */
export const ADVANCE_RANKS: readonly (readonly [string, number])[] = [
  ['POR_CONTACTAR', 0],
  ['CONTACTADO', 1],
  ['SIN_RESPUESTA', 1],
  ['CON_RESPUESTA', 2],
  ['AGENDANDO_CITA', 3],
  ['EN_PROCESO_CONTRATO', 4],
  ['CONTRATO_ACTIVO', 5],
];

const rankCase = (column: Prisma.Sql, whenDiscarded: number, whenNull: number): Prisma.Sql =>
  Prisma.sql`CASE ${column} ${Prisma.join(
    ADVANCE_RANKS.map(([status, rank]) => Prisma.sql`WHEN ${status} THEN ${rank}`),
    ' ',
  )} WHEN ${'DESCARTADO'} THEN ${whenDiscarded} ELSE ${whenNull} END`;

/** Avance = el destino está en una etapa superior a la de origen (DESCARTADO nunca es avance). */
export function advancesByUserSql(scope: AnalyticsScope, range: UtcRange): Prisma.Sql {
  const conditions = between(Prisma.sql`h.[changedAt]`, range);
  if (scope.userId !== undefined) conditions.push(Prisma.sql`h.[userId] = ${scope.userId}`);
  conditions.push(
    Prisma.sql`${rankCase(Prisma.sql`h.[toStatus]`, -1, -1)} > ${rankCase(Prisma.sql`h.[fromStatus]`, 99, -1)}`,
  );
  return Prisma.sql`
    SELECT h.[userId] AS [userId], COUNT(*) AS [total]
    FROM [dbo].[status_history] h ${sectorJoin(scope, Prisma.sql`h.[companyId]`)}
    ${whereAll(conditions)} GROUP BY h.[userId]`;
}

export function appointmentsByUserSql(scope: AnalyticsScope, range: UtcRange): Prisma.Sql {
  const conditions = [
    ...between(Prisma.sql`a.[scheduledAt]`, range),
    Prisma.sql`a.[status] <> ${'CANCELADA'}`,
  ];
  if (scope.userId !== undefined) conditions.push(Prisma.sql`a.[userId] = ${scope.userId}`);
  return Prisma.sql`
    SELECT a.[userId] AS [userId], COUNT(*) AS [total]
    FROM [dbo].[appointments] a ${sectorJoin(scope, Prisma.sql`a.[companyId]`)}
    ${whereAll(conditions)} GROUP BY a.[userId]`;
}

export function contractsByUserSql(scope: AnalyticsScope): Prisma.Sql {
  const conditions = [Prisma.sql`k.[status] = ${'ACTIVO'}`];
  if (scope.userId !== undefined) conditions.push(Prisma.sql`k.[createdById] = ${scope.userId}`);
  return Prisma.sql`
    SELECT k.[createdById] AS [userId], COUNT(*) AS [total]
    FROM [dbo].[contracts] k ${sectorJoin(scope, Prisma.sql`k.[companyId]`)}
    ${whereAll(conditions)} GROUP BY k.[createdById]`;
}
