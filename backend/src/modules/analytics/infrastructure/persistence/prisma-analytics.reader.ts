import {
  INTERACTION_OUTCOMES,
  type InteractionOutcome,
  PIPELINE_STATUSES,
  type PipelineStatus,
  SETTING_DEFAULTS,
} from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type {
  AnalyticsReader,
  AnalyticsScope,
  AnalyticsSettings,
  CurrencyTotal,
  CycleRow,
  ExecutiveMetricRows,
  ExecutiveRef,
  StatusCounts,
  WeeklyActivityRows,
} from '../../application/queries/read-ports';
import type { UtcRange } from '../../application/time/managua-time';
import * as sql from './analytics.sql';

type Row = Record<string, unknown>;

const num = (v: unknown): number => Number(v ?? 0);
const dayOf = (d: Date): string => new Date(d).toISOString().slice(0, 10);

function toStatusCounts(rows: Row[]): StatusCounts {
  const out: StatusCounts = {};
  for (const r of rows) {
    if ((PIPELINE_STATUSES as readonly string[]).includes(r.status as string)) {
      out[r.status as PipelineStatus] = num(r.total);
    }
  }
  return out;
}

const toMap = (rows: Row[]): Map<number, number> =>
  new Map(rows.map((r) => [num(r.userId), num(r.total)]));

/** Adaptador SQL Server de las lecturas de analytics (consultas agregadas parametrizadas). */
@Injectable()
export class PrismaAnalyticsReader implements AnalyticsReader {
  constructor(private readonly prisma: PrismaService) {}

  private query(q: ReturnType<typeof sql.settingsSql>): Promise<Row[]> {
    return this.prisma.db.$queryRaw<Row[]>(q);
  }

  /**
   * Con `sectorId` el mejor plan depende del valor: PRIVADA NACIONAL es el 94 % de las empresas y
   * otros sectores tienen decenas. Un plan en caché compilado para uno de ellos costaba hasta
   * ~20 k lecturas con el otro (prueba de carga QA), así que esas consultas se recompilan
   * (~1 ms; el tablero de analytics no es una ruta caliente).
   */
  private scoped(scope: AnalyticsScope, q: ReturnType<typeof sql.settingsSql>): Promise<Row[]> {
    return this.query(scope.sectorId === undefined ? q : Prisma.sql`${q} OPTION (RECOMPILE)`);
  }

  async settings(): Promise<AnalyticsSettings> {
    const rows = await this.query(sql.settingsSql(['WEEKLY_CONTACT_QUOTA']));
    const raw = rows.find((r) => r.key === 'WEEKLY_CONTACT_QUOTA')?.value;
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return {
      weeklyQuota:
        Number.isFinite(parsed) && parsed > 0
          ? parsed
          : Number(SETTING_DEFAULTS.WEEKLY_CONTACT_QUOTA.value),
    };
  }

  async currentCycle(today: string): Promise<CycleRow | null> {
    const [r] = await this.query(sql.currentCycleSql(today));
    if (!r) return null;
    return {
      id: num(r.id),
      number: num(r.number),
      startDay: dayOf(r.startDate as Date),
      endDay: dayOf(r.endDate as Date),
    };
  }

  async activeExecutives(scope: AnalyticsScope): Promise<ExecutiveRef[]> {
    const rows = await this.scoped(scope, sql.activeExecutivesSql(scope));
    return rows.map((r) => ({ id: num(r.id), fullName: String(r.fullName) }));
  }

  async companiesByStatus(scope: AnalyticsScope): Promise<StatusCounts> {
    return toStatusCounts(await this.scoped(scope, sql.companiesByStatusSql(scope)));
  }

  async reachedByStatus(scope: AnalyticsScope, period: UtcRange): Promise<StatusCounts> {
    return toStatusCounts(await this.scoped(scope, sql.reachedByStatusSql(scope, period)));
  }

  async contactPairs(scope: AnalyticsScope, range: UtcRange): Promise<number> {
    const [r] = await this.scoped(scope, sql.contactPairsSql(scope, range));
    return num(r?.total);
  }

  async appointments(scope: AnalyticsScope, range: UtcRange): Promise<number> {
    const [r] = await this.scoped(scope, sql.appointmentsSql(scope, range));
    return num(r?.total);
  }

  async activeContracts(scope: AnalyticsScope): Promise<CurrencyTotal[]> {
    const rows = await this.scoped(scope, sql.activeContractsSql(scope));
    return rows.map((r) => ({
      currency: String(r.currency),
      count: num(r.total),
      totalAmount: Math.round(num(r.amount) * 100) / 100,
    }));
  }

  async weeklyActivity(
    scope: AnalyticsScope,
    range: UtcRange,
    anchorDay: string,
    byExecutive: boolean,
  ): Promise<WeeklyActivityRows> {
    const [outcomes, companies, executives] = await Promise.all([
      this.scoped(scope, sql.weeklyOutcomesSql(scope, range, anchorDay)),
      this.scoped(scope, sql.weeklyCompaniesSql(scope, range, anchorDay)),
      byExecutive ? this.scoped(scope, sql.weeklyByExecutiveSql(scope, range, anchorDay)) : [],
    ]);
    const known = INTERACTION_OUTCOMES as readonly string[];
    return {
      outcomes: outcomes
        .filter((r) => known.includes(r.outcome as string))
        .map((r) => ({
          week: num(r.week),
          outcome: r.outcome as InteractionOutcome,
          count: num(r.total),
        })),
      companies: companies.map((r) => ({ week: num(r.week), count: num(r.total) })),
      executives: executives.map((r) => ({
        week: num(r.week),
        userId: num(r.userId),
        fullName: String(r.fullName),
        interactions: num(r.interactions),
        companies: num(r.companies),
      })),
    };
  }

  async executiveMetrics(
    scope: AnalyticsScope,
    week: UtcRange,
    cycle: UtcRange | null,
  ): Promise<ExecutiveMetricRows> {
    const [assigned, contactedWeek, contactedCycle, advances, appointments, contracts] =
      await Promise.all([
        this.scoped(scope, sql.assignedByUserSql(scope)),
        this.scoped(scope, sql.contactedByUserSql(scope, week)),
        cycle ? this.scoped(scope, sql.contactedInCycleByUserSql(scope, cycle)) : [],
        this.scoped(scope, sql.advancesByUserSql(scope, week)),
        this.scoped(scope, sql.appointmentsByUserSql(scope, week)),
        this.scoped(scope, sql.contractsByUserSql(scope)),
      ]);
    return {
      assigned: toMap(assigned),
      contactedWeek: toMap(contactedWeek),
      contactedCycle: toMap(contactedCycle),
      advancesWeek: toMap(advances),
      appointmentsWeek: toMap(appointments),
      contractsActive: toMap(contracts),
    };
  }
}
