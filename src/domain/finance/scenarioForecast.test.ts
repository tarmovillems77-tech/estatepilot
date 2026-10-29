import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo';
import { scenarioSetSchema } from '../schemas';
import type { ScenarioSetInput } from '../types';
import { scopeData, type DashboardData } from './dashboard';
import { cumulativeFreeCashFlow, defaultScenarios, scenarioIds } from './forecast';
import { portfolioForecast } from './portfolio';
import { defaultScenarioSet, runScenarioSet } from './scenarioForecast';

const asOf = new Date(2026, 9, 29);
const demo = buildDemoData(asOf);
const data: DashboardData = demo;
const byName = (prefix: string) => demo.properties.find((p) => p.name.startsWith(prefix))!;
const parna = byName('Pärna');
const tahe = byName('Tähe');
const parnaLoan = demo.loans.find((l) => l.propertyId === parna.id)!;

const base = defaultScenarioSet('Vaikimisi');
const run = (set: ScenarioSetInput = base, scope: DashboardData = data) =>
  runScenarioSet(scope, set, asOf);
const withBase = (changes: Partial<ScenarioSetInput['scenarios']['base']>): ScenarioSetInput => ({
  ...base,
  scenarios: { ...base.scenarios, base: { ...base.scenarios.base, ...changes } },
});

describe('default scenario set', () => {
  it('is valid and reproduces the dashboard forecast exactly', () => {
    expect(scenarioSetSchema.safeParse(base).success).toBe(true);
    const result = run();
    for (const id of scenarioIds) {
      const dashboard = portfolioForecast({ ...data, asOf, scenario: defaultScenarios[id] });
      expect(result.total[id].map((y) => y.freeCashFlow)).toEqual(
        dashboard.map((y) => y.freeCashFlow),
      );
    }
  });

  it('covers every owned property, the portfolio-level loan and five years', () => {
    const result = run();
    expect(result.byProperty.size).toBe(3);
    expect(result.portfolioLoans).not.toBeNull();
    expect(result.total.base).toHaveLength(5);
  });

  it('never changes stored data', () => {
    const before = structuredClone(demo);
    run({
      ...base,
      propertyOverrides: { [parna.id]: { rentIndexation: 0, valueGrowth: -0.1 } },
      loanOverrides: { [parnaLoan.id]: { margin: 0.05, remainingYears: 10 } },
    });
    expect(demo).toEqual(before);
  });
});

describe('forecast figures', () => {
  const years = run().total.base;

  it('splits debt service into interest and principal', () => {
    for (const y of years) expect(y.interest + y.principal).toBeCloseTo(y.debtService, 6);
  });

  it('computes net yield on the total investment', () => {
    for (const y of years) expect(y.netYield).toBeCloseTo(y.noi / y.totalInvestment, 10);
  });

  it('keeps equity at value − loan balance: free cash flow does not accumulate into it', () => {
    for (const y of years) expect(y.equity).toBeCloseTo(y.propertyValue - y.loanBalance, 6);
    const moreReserve = run(withBase({ capexReserveRate: 0.2 })).total.base;
    expect(moreReserve[4]!.freeCashFlow).toBeLessThan(years[4]!.freeCashFlow);
    expect(moreReserve[4]!.equity).toBeCloseTo(years[4]!.equity, 6);
    expect(cumulativeFreeCashFlow(years).at(-1)).toBeCloseTo(
      years.reduce((s, y) => s + y.freeCashFlow, 0),
      6,
    );
  });

  it('deducts the maintenance reserve per m² from NOI', () => {
    const reserve = run(withBase({ maintenanceReservePerM2: 2 })).byProperty.get(parna.id)!.base;
    const plain = run().byProperty.get(parna.id)!.base;
    expect(reserve[0]!.maintenanceReserve).toBeCloseTo(194 * 2, 6);
    expect(plain[0]!.noi - reserve[0]!.noi).toBeCloseTo(388, 6);
  });

  it('scales operating costs with the adjustment', () => {
    const higher = run(withBase({ opexAdjustment: 0.1 })).total.base;
    expect(higher[0]!.operatingExpenses).toBeCloseTo(years[0]!.operatingExpenses * 1.1, 6);
  });
});

describe('per-property rent indexation', () => {
  it('uses the property’s own rate instead of one common rent growth', () => {
    // Pärna: no property default, so non-indexed rents follow the market (2,5% in base).
    const market = run().byProperty.get(parna.id)!.base;
    expect(market[4]!.grossPotentialRent).toBeGreaterThan(market[0]!.grossPotentialRent);

    // With 0% for Pärna its rent stays flat, while Tähe still grows by its leases.
    const flat = run({
      ...base,
      propertyOverrides: { [parna.id]: { rentIndexation: 0, valueGrowth: null } },
    });
    const parnaYears = flat.byProperty.get(parna.id)!.base;
    expect(parnaYears[4]!.grossPotentialRent).toBeCloseTo(parnaYears[0]!.grossPotentialRent, 6);
    expect(flat.byProperty.get(tahe.id)!.base[4]!.grossPotentialRent).toBeCloseTo(
      run().byProperty.get(tahe.id)!.base[4]!.grossPotentialRent,
      6,
    );
  });

  it('applies a value change to that property only', () => {
    const result = run({
      ...base,
      propertyOverrides: { [parna.id]: { rentIndexation: null, valueGrowth: -0.05 } },
    });
    expect(result.byProperty.get(parna.id)!.base[0]!.propertyValue).toBeCloseTo(
      parna.marketValue * 0.95,
      6,
    );
    expect(result.byProperty.get(tahe.id)!.base[0]!.propertyValue).toBeCloseTo(
      tahe.marketValue * 1.02,
      6,
    );
  });
});

describe('interest rate assumptions', () => {
  const debt = (set: ScenarioSetInput, propertyId: string) =>
    run(set).byProperty.get(propertyId)!.base[1]!.interest;

  it('uses the 6M path for 6M loans and the 3M path for 3M loans', () => {
    const higher6m = withBase({ euribor6m: [0.05, 0.05, 0.05, 0.05, 0.05] });
    expect(debt(higher6m, parna.id)).toBeGreaterThan(debt(base, parna.id)); // 6M loan
    expect(debt(higher6m, tahe.id)).toBeCloseTo(debt(base, tahe.id), 6); // 3M loan
  });

  it('applies a margin change and per-loan margin and term overrides', () => {
    expect(debt(withBase({ marginChange: 0.01 }), parna.id)).toBeGreaterThan(debt(base, parna.id));
    const ownMargin = {
      ...base,
      loanOverrides: { [parnaLoan.id]: { margin: 0.03, remainingYears: null } },
    };
    expect(debt(ownMargin, parna.id)).toBeGreaterThan(debt(base, parna.id));

    const longer = run({
      ...base,
      loanOverrides: { [parnaLoan.id]: { margin: null, remainingYears: 30 } },
    }).byProperty.get(parna.id)!.base;
    const plain = run().byProperty.get(parna.id)!.base;
    expect(longer[0]!.debtService).toBeLessThan(plain[0]!.debtService);
    expect(longer[0]!.loanBalance).toBeGreaterThan(plain[0]!.loanBalance);
  });
});

describe('refinancing after five years', () => {
  it('moves the year-5 balance and compares payments and DSCR', () => {
    const result = run();
    const refi = result.refinance!.base;
    expect(refi.date).toBe('2031-11-01');
    expect(refi.balance).toBeCloseTo(result.total.base[4]!.loanBalance, 0);
    expect(refi.loans).toBe(4);
    expect(refi.fees).toBe(4_000);
    expect(refi.dscrCurrent).toBeCloseTo(refi.noi / refi.current.annualDebtService, 10);
  });

  it('lowers debt service with a lower margin and longer term', () => {
    const cheaper = run({ ...base, refinance: { ...base.refinance, margin: 0.01, termYears: 25 } });
    const refi = cheaper.refinance!.base;
    expect(refi.refinanced.annualDebtService).toBeLessThan(refi.current.annualDebtService);
    expect(refi.dscrRefinanced!).toBeGreaterThan(refi.dscrCurrent!);
  });

  it('can be switched off', () => {
    expect(run({ ...base, refinance: { ...base.refinance, enabled: false } }).refinance).toBeNull();
  });
});

describe('single property', () => {
  it('forecasts one property without the portfolio-level loan', () => {
    const result = run(base, scopeData(data, parna.id));
    expect(result.byProperty.size).toBe(1);
    expect(result.portfolioLoans).toBeNull();
    expect(result.total.base[0]!.noi).toBeCloseTo(result.byProperty.get(parna.id)!.base[0]!.noi, 6);
  });
});
