import { describe, expect, it } from 'vitest';
import type { LoanInput } from '../types';
import {
  combineForecasts,
  defaultScenarios,
  forecast,
  forecastInputFor,
  type ForecastInput,
  type Scenario,
} from './forecast';

const flat: Scenario = {
  rentGrowth: 0,
  vacancyRate: 0,
  opexGrowth: 0,
  valueGrowth: 0,
  capexReserveRate: 0,
  opexAdjustment: 0,
  maintenanceReservePerM2: 0,
  euribor3m: [0.02],
  euribor6m: [0.02],
  marginChange: 0,
};

const variableLoan: LoanInput = {
  propertyId: 'p',
  lender: 'Näidispank AS',
  principal: 300_000,
  startDate: '2024-01-01',
  termMonths: 300,
  repaymentType: 'annuity',
  rateType: 'euribor',
  margin: 0.02,
  euribor: 0.025,
  euriborTenor: '3M',
  dayCount: '30/360',
  actualBalance: null,
};

const input: ForecastInput = {
  startDate: '2026-11-01',
  rentStreams: [{ annualRent: 48_000, indexation: null }],
  otherIncome: 2_000,
  operatingExpenses: 8_000,
  marketValue: 500_000,
  equityInvested: 200_000,
  loans: [],
};

describe('forecast', () => {
  it('produces five consecutive 12-month years', () => {
    const years = forecast(input, flat);
    expect(years.map((y) => [y.from, y.to])).toEqual([
      ['2026-11-01', '2027-10-31'],
      ['2027-11-01', '2028-10-31'],
      ['2028-11-01', '2029-10-31'],
      ['2029-11-01', '2030-10-31'],
      ['2030-11-01', '2031-10-31'],
    ]);
  });

  it('keeps NOI constant when nothing grows', () => {
    const years = forecast(input, flat);
    expect(years.every((y) => y.noi === 42_000)).toBe(true);
    expect(years[0]?.freeCashFlow).toBe(42_000);
    expect(years[0]?.dscr).toBeNull();
    expect(years[0]?.cashOnCash).toBeCloseTo(0.21);
  });

  it('applies rent growth from year 2 and cost growth from year 1', () => {
    const [y1, y2] = forecast(input, { ...flat, rentGrowth: 0.1, opexGrowth: 0.05 });
    expect(y1?.grossPotentialRent).toBeCloseTo(48_000);
    expect(y2?.grossPotentialRent).toBeCloseTo(52_800);
    expect(y1?.operatingExpenses).toBeCloseTo(8_400);
  });

  it('deducts vacancy and the capex reserve', () => {
    const [y1] = forecast(input, { ...flat, vacancyRate: 0.1, capexReserveRate: 0.05 });
    expect(y1?.vacancyLoss).toBeCloseTo(4_800);
    expect(y1?.effectiveGrossIncome).toBeCloseTo(45_200);
    expect(y1?.capexReserve).toBeCloseTo(2_260);
    expect(y1?.freeCashFlow).toBeCloseTo(45_200 - 8_000 - 2_260);
  });

  it('reprices variable loans with the scenario Euribor', () => {
    const withLoan = { ...input, loans: [variableLoan] };
    const low = forecast(withLoan, { ...flat, euribor3m: [0.01] });
    const high = forecast(withLoan, { ...flat, euribor3m: [0.04] });
    expect(high[0]?.interest).toBeGreaterThan(low[0]?.interest ?? Infinity);
    expect(high[0]?.dscr).toBeLessThan(low[0]?.dscr ?? 0);
    // Loan amortises over time.
    expect(low[4]?.loanBalance).toBeLessThan(low[0]?.loanBalance ?? 0);
  });

  it('is unaffected by Euribor for fixed-rate loans', () => {
    const fixedLoan: LoanInput = {
      ...variableLoan,
      rateType: 'fixed',
      fixedRate: 0.045,
    } as LoanInput;
    const withLoan = { ...input, loans: [fixedLoan] };
    expect(forecast(withLoan, { ...flat, euribor3m: [0.01] })[0]?.interest).toBeCloseTo(
      forecast(withLoan, { ...flat, euribor3m: [0.05] })[0]?.interest ?? 0,
      6,
    );
  });

  it('accepts other loan terms for what-if analysis', () => {
    const longer = { ...variableLoan, termMonths: 360 };
    const [short] = forecast({ ...input, loans: [variableLoan] }, flat);
    const [long] = forecast({ ...input, loans: [longer] }, flat);
    expect(long?.debtService).toBeLessThan(short?.debtService ?? 0);
  });

  it('ranks the default scenarios from optimistic to pessimistic', () => {
    const withLoan = { ...input, loans: [variableLoan] };
    const fcf = (s: Scenario) => forecast(withLoan, s)[4]?.freeCashFlow ?? 0;
    expect(fcf(defaultScenarios.optimistic)).toBeGreaterThan(fcf(defaultScenarios.base));
    expect(fcf(defaultScenarios.base)).toBeGreaterThan(fcf(defaultScenarios.pessimistic));
  });
});

describe('rent indexation', () => {
  const streams = (indexation: number | null) => ({
    ...input,
    rentStreams: [{ annualRent: 48_000, indexation }],
  });

  it('uses the stream’s own indexation instead of the scenario', () => {
    const years = forecast(streams(0.03), { ...flat, rentGrowth: 0.1 });
    expect(years[1]?.grossPotentialRent).toBeCloseTo(48_000 * 1.03);
  });

  it('keeps rent flat with 0% indexation even when the market grows', () => {
    const years = forecast(streams(0), { ...flat, rentGrowth: 0.1 });
    expect(years[4]?.grossPotentialRent).toBe(48_000);
  });

  it('falls back to the scenario’s market growth without indexation', () => {
    const years = forecast(streams(null), { ...flat, rentGrowth: 0.1 });
    expect(years[1]?.grossPotentialRent).toBeCloseTo(52_800);
  });
});

describe('combineForecasts', () => {
  it('adds amounts and recomputes ratios', () => {
    const a = forecast({ ...input, loans: [variableLoan] }, flat);
    const b = forecast(input, flat);
    const [combined] = combineForecasts([a, b]);
    expect(combined?.noi).toBeCloseTo(84_000);
    expect(combined?.loanBalance).toBeCloseTo(a[0]?.loanBalance ?? 0);
    expect(combined?.ltv).toBeCloseTo((a[0]?.loanBalance ?? 0) / 1_000_000);
  });
});

describe('forecastInputFor', () => {
  const units = [
    { id: 'u1', marketRent: 800 },
    { id: 'u2', marketRent: 600 },
  ];

  const property = {
    type: 'residential' as const,
    purchasePrice: 300_000,
    acquisitionCosts: 6_000,
    marketValue: 310_000,
    rentIndexation: 0.02,
  };
  const lease = {
    unitId: 'u1',
    startDate: '2026-01-01',
    endDate: null,
    monthlyRent: 750,
    annualIndexation: null,
  };

  it('uses the rent roll and estimates costs without history', () => {
    const result = forecastInputFor({
      property,
      units,
      leases: [lease],
      trailingTransactions: [],
      loans: [{ ...variableLoan, principal: 200_000 }],
      asOf: new Date(2026, 9, 28),
    });
    expect(result.startDate).toBe('2026-11-01');
    expect(result.rentStreams.reduce((s, r) => s + r.annualRent, 0)).toBe((750 + 600) * 12);
    expect(result.operatingExpenses).toBeCloseTo(16_200 * 0.15);
    expect(result.equityInvested).toBe(106_000);
  });

  it('takes indexation from the lease first, then from the property', () => {
    const asOf = new Date(2026, 9, 28);
    const inherit = forecastInputFor({
      property,
      units,
      leases: [lease],
      trailingTransactions: [],
      loans: [],
      asOf,
    });
    expect(inherit.rentStreams.map((s) => s.indexation)).toEqual([0.02, 0.02]);

    const own = forecastInputFor({
      property: { ...property, rentIndexation: null },
      units,
      leases: [{ ...lease, annualIndexation: 0 }],
      trailingTransactions: [],
      loans: [],
      asOf,
    });
    expect(own.rentStreams.map((s) => s.indexation)).toEqual([0, null]);
  });
});
