import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo';
import { defaultScenarios, scenarioIds } from './forecast';
import { portfolioForecast, portfolioPerformance } from './portfolio';

// End-to-end check of the finance engine on the fictional demo portfolio.
const asOf = new Date(2026, 9, 28);
const demo = buildDemoData(asOf);
const result = portfolioPerformance({ ...demo, asOf });

describe('portfolioPerformance on demo data', () => {
  it('uses the last 12 full months', () => {
    expect(result.period).toEqual({ from: '2025-10-01', to: '2026-09-30' });
  });

  it('covers owned properties only', () => {
    expect(result.byProperty.size).toBe(3);
  });

  it('produces plausible figures for every property', () => {
    for (const p of result.byProperty.values()) {
      expect(p.noi).toBeGreaterThan(0);
      expect(p.netYield).toBeGreaterThan(0.03);
      expect(p.netYield).toBeLessThan(0.1);
      expect(p.dscr).toBeGreaterThan(1);
      expect(p.dscr).toBeLessThan(2);
      expect(p.ltv).toBeGreaterThan(0.3);
      expect(p.ltv).toBeLessThan(0.7);
    }
  });

  it('adds up to the portfolio total', () => {
    const noi = [...result.byProperty.values()].reduce((s, p) => s + p.noi, 0);
    expect(result.total.noi).toBeCloseTo(noi, 6);
    expect(result.total.monthlyNoi).toBeCloseTo(noi / 12, 6);
  });

  it('computes equity as market value minus loan balance', () => {
    const { total } = result;
    expect(total.equity).toBeCloseTo(total.marketValue - total.loanBalance, 6);
    expect(total.equity).toBeGreaterThan(0);
  });
});

describe('portfolioForecast on demo data', () => {
  const run = (id: (typeof scenarioIds)[number]) =>
    portfolioForecast({ ...demo, asOf, scenario: defaultScenarios[id] });

  it('forecasts five years for every scenario with optimistic ≥ base ≥ pessimistic', () => {
    const totals = scenarioIds.map((id) => {
      const years = run(id);
      expect(years).toHaveLength(5);
      return years.reduce((s, y) => s + y.freeCashFlow, 0);
    });
    const [optimistic = 0, base = 0, pessimistic = 0] = totals;
    expect(optimistic).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(pessimistic);
  });

  it('amortises the loans and lowers LTV in the base case', () => {
    const years = run('base');
    expect(years[4]?.loanBalance).toBeLessThan(result.total.loanBalance);
    expect(years[4]?.ltv).toBeLessThan(result.total.ltv ?? 0);
  });
});
