import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo';
import { toIsoDate } from '../dates';
import { combineForecasts, defaultScenarios, forecast, forecastInputFor } from './forecast';
import { portfolioPerformance } from './portfolio';

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

  it('forecasts five years for every scenario with optimistic ≥ base ≥ pessimistic', () => {
    const today = toIsoDate(asOf);
    const fcfByScenario = (['optimistic', 'base', 'pessimistic'] as const).map((id) => {
      const perProperty = demo.properties
        .filter((p) => p.status === 'owned')
        .map((property) => {
          const units = demo.units.filter((u) => u.propertyId === property.id);
          const unitIds = new Set(units.map((u) => u.id));
          return forecast(
            forecastInputFor({
              property,
              units,
              leases: demo.leases.filter((l) => unitIds.has(l.unitId) && l.startDate <= today),
              trailingTransactions: demo.transactions.filter(
                (t) =>
                  t.propertyId === property.id &&
                  t.date >= result.period.from &&
                  t.date <= result.period.to,
              ),
              loans: demo.loans.filter((l) => l.propertyId === property.id),
              asOf,
            }),
            defaultScenarios[id],
          );
        });
      const combined = combineForecasts(perProperty);
      expect(combined).toHaveLength(5);
      return combined.reduce((s, y) => s + y.freeCashFlow, 0);
    });
    const [optimistic = 0, base = 0, pessimistic = 0] = fcfByScenario;
    expect(optimistic).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(pessimistic);
  });
});
