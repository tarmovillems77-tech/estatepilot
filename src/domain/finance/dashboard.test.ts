import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo';
import type { Loan } from '../types';
import {
  buildAlerts,
  cashFlowHistory,
  DSCR_THRESHOLD,
  projection,
  scopeData,
  type DashboardData,
} from './dashboard';
import { monthStatements } from './ledger';
import { portfolioPerformance } from './portfolio';

const asOf = new Date(2026, 9, 29);
const demo = buildDemoData(asOf);
const data: DashboardData = demo;
const parna = demo.properties.find((p) => p.name.startsWith('Pärna'))!;

describe('scopeData', () => {
  it('keeps one property with its units, leases, transactions and loans', () => {
    const scoped = scopeData(data, parna.id);
    expect(scoped.properties).toEqual([parna]);
    expect(scoped.units.every((u) => u.propertyId === parna.id)).toBe(true);
    expect(scoped.transactions.every((t) => t.propertyId === parna.id)).toBe(true);
    expect(scoped.loans.map((l) => l.propertyId)).toEqual([parna.id]);
    expect(scoped.leases.length).toBeGreaterThan(0);
  });

  it('returns everything for the portfolio, including portfolio-level loans', () => {
    expect(scopeData(data, null)).toBe(data);
  });
});

describe('cashFlowHistory', () => {
  const history = cashFlowHistory(data, asOf);

  it('covers the last 12 full months', () => {
    expect(history.map((p) => p.month)).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('adds up to the 12-month performance used by the KPI cards', () => {
    const performance = portfolioPerformance({ ...data, asOf });
    const sum = (key: 'noi' | 'debtService' | 'freeCashFlow') =>
      history.reduce((s, p) => s + p[key], 0);
    expect(sum('noi')).toBeCloseTo(performance.total.noi, 6);
    expect(sum('debtService')).toBeCloseTo(performance.total.debtService, 6);
    expect(sum('freeCashFlow')).toBeCloseTo(performance.total.freeCashFlow, 6);
  });

  it('computes free cash flow as NOI − capex − debt service in every month', () => {
    for (const p of history) {
      expect(p.freeCashFlow).toBeCloseTo(p.noi - p.capex - p.debtService, 6);
    }
  });

  it('matches the ledger for a single property', () => {
    const scoped = scopeData(data, parna.id);
    const fromLedger = monthStatements({
      transactions: scoped.transactions,
      loans: scoped.loans,
      months: ['2026-05'],
      asOf: '2026-10-29',
    })[0];
    const may = cashFlowHistory(scoped, asOf).find((p) => p.month === '2026-05');
    expect(may?.noi).toBeCloseTo(fromLedger?.noi ?? NaN, 6);
    expect(may?.capex).toBe(6_400); // demo staircase renovation
  });
});

describe('projection', () => {
  const result = projection(data, asOf);

  it('starts with today and adds five forecast years', () => {
    expect(result.points.map((p) => p.kind)).toEqual([
      'current',
      'forecast',
      'forecast',
      'forecast',
      'forecast',
      'forecast',
    ]);
    expect(result.points[0]?.date).toBe('2026-10-29');
  });

  it('uses today’s balances and values for the first point', () => {
    const [now] = result.points;
    expect(now?.loanBalance).toBeCloseTo(result.performance.total.loanBalance, 6);
    expect(now?.equity).toBeCloseTo(now!.propertyValue - now!.loanBalance, 6);
    expect(now?.ltv.base).toBeCloseTo(now!.loanBalance / now!.propertyValue, 10);
  });

  it('takes forecast points from the scenario forecasts', () => {
    const year3 = result.points[3];
    expect(year3?.loanBalance).toBe(result.scenarios.base[2]?.loanBalance);
    expect(year3?.dscr.pessimistic).toBe(result.scenarios.pessimistic[2]?.dscr);
    expect(year3?.ltv.optimistic).toBe(result.scenarios.optimistic[2]?.ltv);
  });

  it('pays down debt and builds equity in the base case', () => {
    const first = result.points[0]!;
    const last = result.points.at(-1)!;
    expect(last.loanBalance).toBeLessThan(first.loanBalance);
    expect(last.equity).toBeGreaterThan(first.equity);
  });
});

describe('buildAlerts', () => {
  const alerts = buildAlerts(data, asOf, {
    cashFlow: cashFlowHistory(data, asOf),
    projection: projection(data, asOf),
  });
  const kinds = alerts.map((a) => a.kind);

  it('reports the demo arrears per tenant, most severe first', () => {
    const overdue = alerts.filter((a) => a.kind === 'overdueRent');
    expect(overdue).toHaveLength(2);
    expect(overdue.reduce((s, a) => s + (a.kind === 'overdueRent' ? a.amount : 0), 0)).toBe(3_080);
    expect(alerts[0]?.severity).toBe('critical');
  });

  it('reports ending leases, negative cash flow months and vacant units', () => {
    expect(kinds.filter((k) => k === 'leaseEnding')).toHaveLength(2);
    expect(kinds).toContain('negativeCashFlow');
    expect(kinds).toContain('vacantUnits');
  });

  it('flags DSCR below 1,20 and not above it', () => {
    const low = alerts.filter((a) => a.kind === 'lowDscr');
    expect(low.every((a) => a.kind === 'lowDscr' && a.dscr < DSCR_THRESHOLD)).toBe(true);
  });

  it('raises a DSCR alert when a loan makes coverage too thin', () => {
    const extraLoan: Loan = {
      ...demo.loans[0]!,
      id: 'extra',
      propertyId: parna.id,
      principal: 400_000,
      actualBalance: null,
    };
    const stressed = scopeData({ ...data, loans: [...data.loans, extraLoan] }, parna.id);
    const result = buildAlerts(stressed, asOf, {
      cashFlow: cashFlowHistory(stressed, asOf),
      projection: projection(stressed, asOf),
    });
    const trailing = result.find((a) => a.kind === 'lowDscr' && a.basis === 'trailing');
    expect(trailing).toMatchObject({ propertyId: parna.id, severity: 'critical' });
    expect(result.some((a) => a.kind === 'negativeCashFlowForecast')).toBe(true);
  });
});
