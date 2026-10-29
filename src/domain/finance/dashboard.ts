import { addMonths, daysBetween, fromIsoDate, toIsoDate, trailingTwelveMonths } from '../dates';
import { isLeaseActive, isLeaseEndingSoon } from '../leases';
import { arrears, monthOf, monthsBetween, rentLines } from '../rent';
import type { Lease, Loan, Property, Tenant, Transaction, Unit } from '../types';
import { defaultScenarios, scenarioIds, type ForecastYear, type ScenarioId } from './forecast';
import { monthStatements } from './ledger';
import { portfolioForecast, portfolioPerformance, type PortfolioPerformance } from './portfolio';

/*
 * Everything the dashboard shows, computed from stored data. Charts receive these series as
 * they are — no figure on the dashboard is entered by hand.
 */

/** Banks typically require a DSCR of at least this. */
export const DSCR_THRESHOLD = 1.2;

export interface DashboardData {
  properties: readonly Property[];
  units: readonly Unit[];
  leases: readonly Lease[];
  tenants: readonly Tenant[];
  transactions: readonly Transaction[];
  loans: readonly Loan[];
}

/**
 * Data for one property, or the whole portfolio when `propertyId` is null. Portfolio-level
 * loans belong to the portfolio view only.
 */
export function scopeData(data: DashboardData, propertyId: string | null): DashboardData {
  if (propertyId === null) return data;
  const units = data.units.filter((u) => u.propertyId === propertyId);
  const unitIds = new Set(units.map((u) => u.id));
  return {
    properties: data.properties.filter((p) => p.id === propertyId),
    units,
    leases: data.leases.filter((l) => unitIds.has(l.unitId)),
    tenants: data.tenants,
    transactions: data.transactions.filter((t) => t.propertyId === propertyId),
    loans: data.loans.filter((l) => l.propertyId === propertyId),
  };
}

export interface CashFlowPoint {
  /** "YYYY-MM" */
  month: string;
  noi: number;
  debtService: number;
  capex: number;
  /** NOI − capital expenditure − debt service */
  freeCashFlow: number;
}

/** NOI, loan payments and free cash flow for each of the last 12 full months. */
export function cashFlowHistory(data: DashboardData, asOf: Date): CashFlowPoint[] {
  const period = trailingTwelveMonths(asOf);
  const owned = new Set(data.properties.filter((p) => p.status === 'owned').map((p) => p.id));
  return monthStatements({
    transactions: data.transactions.filter((t) => owned.has(t.propertyId)),
    loans: data.loans.filter((l) => l.propertyId === null || owned.has(l.propertyId)),
    months: monthsBetween(monthOf(period.from), monthOf(period.to)),
    asOf: toIsoDate(asOf),
  }).map((s) => ({
    month: s.period,
    noi: s.noi,
    debtService: s.debtService,
    capex: s.capex,
    freeCashFlow: s.cashFlow,
  }));
}

export interface ProjectionPoint {
  /** ISO date: today for the first point, then the end of each forecast year. */
  date: string;
  /** First point: today's figures (loan balance actual or calculated); then forecasts. */
  kind: 'current' | 'forecast';
  /** Base scenario. */
  loanBalance: number;
  propertyValue: number;
  equity: number;
  ltv: Record<ScenarioId, number | null>;
  /** First point: last 12 months. */
  dscr: Record<ScenarioId, number | null>;
  freeCashFlow: Record<ScenarioId, number>;
}

export interface Projection {
  performance: PortfolioPerformance;
  scenarios: Record<ScenarioId, ForecastYear[]>;
  points: ProjectionPoint[];
}

const byScenario = <T>(value: (id: ScenarioId) => T) =>
  Object.fromEntries(scenarioIds.map((id) => [id, value(id)])) as Record<ScenarioId, T>;

/** Today's position followed by five forecast years for every scenario. */
export function projection(data: DashboardData, asOf: Date): Projection {
  const performance = portfolioPerformance({ ...data, asOf });
  const scenarios = byScenario((id) =>
    portfolioForecast({ ...data, asOf, scenario: defaultScenarios[id] }),
  );
  const { total } = performance;

  const current: ProjectionPoint = {
    date: toIsoDate(asOf),
    kind: 'current',
    loanBalance: total.loanBalance,
    propertyValue: total.marketValue,
    equity: total.equity,
    ltv: byScenario(() => total.ltv),
    dscr: byScenario(() => total.dscr),
    freeCashFlow: byScenario(() => total.freeCashFlow),
  };
  const forecastPoints = scenarios.base.map((year, index): ProjectionPoint => ({
    date: year.to,
    kind: 'forecast',
    loanBalance: year.loanBalance,
    propertyValue: year.propertyValue,
    equity: year.equity,
    ltv: byScenario((id) => scenarios[id][index]?.ltv ?? null),
    dscr: byScenario((id) => scenarios[id][index]?.dscr ?? null),
    freeCashFlow: byScenario((id) => scenarios[id][index]?.freeCashFlow ?? 0),
  }));

  return { performance, scenarios, points: [current, ...forecastPoints] };
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type Alert =
  | {
      kind: 'overdueRent';
      severity: 'critical';
      tenantId: string;
      amount: number;
      months: string[];
    }
  | {
      kind: 'leaseEnding';
      severity: 'warning';
      leaseId: string;
      tenantId: string;
      unitId: string;
      endDate: string;
      days: number;
    }
  | { kind: 'negativeCashFlow'; severity: 'warning'; months: string[]; total: number }
  | {
      kind: 'negativeCashFlowForecast';
      severity: 'critical' | 'warning';
      scenario: ScenarioId;
      years: number[];
    }
  | {
      kind: 'lowDscr';
      severity: 'critical' | 'warning';
      /** null = whole portfolio */
      propertyId: string | null;
      dscr: number;
      /** Trailing 12 months, or the weakest forecast year of a scenario. */
      basis: 'trailing' | ScenarioId;
      year?: number;
    }
  | { kind: 'vacantUnits'; severity: 'info'; unitIds: string[]; marketRent: number };

const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** DSCR below 1 means the property does not cover its loan payments at all. */
const dscrSeverity = (dscr: number) => (dscr < 1 ? 'critical' : 'warning');

export function buildAlerts(
  data: DashboardData,
  asOf: Date,
  { cashFlow, projection: proj }: { cashFlow: CashFlowPoint[]; projection: Projection },
): Alert[] {
  const today = toIsoDate(asOf);
  const alerts: Alert[] = [];

  // Overdue rent over the last 12 months, per tenant.
  const firstMonth = monthOf(toIsoDate(addMonths(fromIsoDate(today), -12)));
  const overdue = arrears(
    rentLines(
      [...data.leases],
      data.transactions,
      monthsBetween(firstMonth, monthOf(today)),
      today,
    ),
    today,
  );
  const byTenant = new Map<string, { amount: number; months: string[] }>();
  for (const line of overdue) {
    const entry = byTenant.get(line.tenantId) ?? { amount: 0, months: [] };
    entry.amount += line.outstanding;
    entry.months.push(line.month);
    byTenant.set(line.tenantId, entry);
  }
  for (const [tenantId, entry] of byTenant) {
    alerts.push({ kind: 'overdueRent', severity: 'critical', tenantId, ...entry });
  }

  // Leases ending soon.
  for (const lease of data.leases) {
    if (!isLeaseEndingSoon(lease, today) || lease.endDate === null) continue;
    alerts.push({
      kind: 'leaseEnding',
      severity: 'warning',
      leaseId: lease.id,
      tenantId: lease.tenantId,
      unitId: lease.unitId,
      endDate: lease.endDate,
      days: daysBetween(today, lease.endDate),
    });
  }

  // Negative free cash flow: past months, then forecast years.
  const negativeMonths = cashFlow.filter((p) => p.freeCashFlow < 0);
  if (negativeMonths.length > 0) {
    alerts.push({
      kind: 'negativeCashFlow',
      severity: 'warning',
      months: negativeMonths.map((p) => p.month),
      total: negativeMonths.reduce((sum, p) => sum + p.freeCashFlow, 0),
    });
  }
  for (const scenario of ['base', 'pessimistic'] as const) {
    const years = proj.scenarios[scenario].filter((y) => y.freeCashFlow < 0).map((y) => y.year);
    if (years.length > 0) {
      alerts.push({
        kind: 'negativeCashFlowForecast',
        severity: scenario === 'base' ? 'critical' : 'warning',
        scenario,
        years,
      });
    }
  }

  // DSCR below the threshold: each property and the total over the last 12 months …
  const trailing = [
    ...[...proj.performance.byProperty].map(([propertyId, p]) => ({ propertyId, dscr: p.dscr })),
    ...(proj.performance.byProperty.size > 1 || proj.performance.portfolioLoans
      ? [{ propertyId: null, dscr: proj.performance.total.dscr }]
      : []),
  ];
  for (const { propertyId, dscr } of trailing) {
    if (dscr !== null && dscr < DSCR_THRESHOLD) {
      alerts.push({
        kind: 'lowDscr',
        severity: dscrSeverity(dscr),
        propertyId,
        dscr,
        basis: 'trailing',
      });
    }
  }
  // … and the weakest forecast year of the base and pessimistic scenarios.
  const scopeId = data.properties.length === 1 ? (data.properties[0]?.id ?? null) : null;
  for (const scenario of ['base', 'pessimistic'] as const) {
    const weakest = proj.scenarios[scenario]
      .filter((y) => y.dscr !== null)
      .sort((a, b) => (a.dscr ?? 0) - (b.dscr ?? 0))[0];
    if (weakest?.dscr != null && weakest.dscr < DSCR_THRESHOLD) {
      alerts.push({
        kind: 'lowDscr',
        severity: scenario === 'base' ? dscrSeverity(weakest.dscr) : 'warning',
        propertyId: scopeId,
        dscr: weakest.dscr,
        basis: scenario,
        year: weakest.year,
      });
    }
  }

  // Vacant units of owned properties.
  const owned = new Set(data.properties.filter((p) => p.status === 'owned').map((p) => p.id));
  const leased = new Set(data.leases.filter((l) => isLeaseActive(l, today)).map((l) => l.unitId));
  const vacant = data.units.filter((u) => owned.has(u.propertyId) && !leased.has(u.id));
  if (vacant.length > 0) {
    alerts.push({
      kind: 'vacantUnits',
      severity: 'info',
      unitIds: vacant.map((u) => u.id),
      marketRent: vacant.reduce((sum, u) => sum + u.marketRent, 0),
    });
  }

  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
