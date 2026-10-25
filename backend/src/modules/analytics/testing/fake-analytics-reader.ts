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
} from '../application/queries/read-ports';
import type { UtcRange } from '../application/time/managua-time';

/** Lector falso: devuelve datos fijos y registra los alcances con que se le llamó. */
export class FakeAnalyticsReader implements AnalyticsReader {
  scopes: AnalyticsScope[] = [];
  quota = 20;
  cycle: CycleRow | null = null;
  executives: ExecutiveRef[] = [
    { id: 7, fullName: 'Ana Pérez' },
    { id: 8, fullName: 'Luis Gómez' },
  ];
  byStatus: StatusCounts = {
    POR_CONTACTAR: 90,
    CONTACTADO: 4,
    CON_RESPUESTA: 4,
    CONTRATO_ACTIVO: 2,
  };
  reached: StatusCounts = {
    CONTACTADO: 10,
    CON_RESPUESTA: 5,
    AGENDANDO_CITA: 2,
    CONTRATO_ACTIVO: 1,
  };
  pairs = 20;
  appointmentCount = 3;
  contracts: CurrencyTotal[] = [
    { currency: 'NIO', count: 2, totalAmount: 1000.5 },
    { currency: 'USD', count: 1, totalAmount: 300 },
  ];
  weekly: WeeklyActivityRows = { outcomes: [], companies: [], executives: [] };
  metrics: ExecutiveMetricRows = {
    assigned: new Map([[7, 40]]),
    contactedWeek: new Map([[7, 10]]),
    contactedCycle: new Map([[7, 10]]),
    advancesWeek: new Map([[7, 2]]),
    appointmentsWeek: new Map(),
    contractsActive: new Map([[7, 1]]),
  };

  private record(scope: AnalyticsScope) {
    this.scopes.push(scope);
  }

  async settings(): Promise<AnalyticsSettings> {
    return { weeklyQuota: this.quota };
  }
  async currentCycle(): Promise<CycleRow | null> {
    return this.cycle;
  }
  async activeExecutives(scope: AnalyticsScope): Promise<ExecutiveRef[]> {
    this.record(scope);
    return this.executives.filter((e) => scope.userId === undefined || e.id === scope.userId);
  }
  async companiesByStatus(scope: AnalyticsScope): Promise<StatusCounts> {
    this.record(scope);
    return this.byStatus;
  }
  async reachedByStatus(scope: AnalyticsScope, _period: UtcRange): Promise<StatusCounts> {
    this.record(scope);
    return this.reached;
  }
  async contactPairs(scope: AnalyticsScope): Promise<number> {
    this.record(scope);
    return this.pairs;
  }
  async appointments(scope: AnalyticsScope): Promise<number> {
    this.record(scope);
    return this.appointmentCount;
  }
  async activeContracts(scope: AnalyticsScope): Promise<CurrencyTotal[]> {
    this.record(scope);
    return this.contracts;
  }
  async weeklyActivity(scope: AnalyticsScope): Promise<WeeklyActivityRows> {
    this.record(scope);
    return this.weekly;
  }
  async executiveMetrics(scope: AnalyticsScope): Promise<ExecutiveMetricRows> {
    this.record(scope);
    return this.metrics;
  }
}
