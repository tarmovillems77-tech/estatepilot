import { describe, expect, it } from 'vitest';
import type { LoanInput, TransactionInput } from '../types';
import {
  combinePerformance,
  dscr,
  freeCashFlow,
  grossYield,
  ltv,
  netYield,
  propertyPerformance,
  summarizeOperations,
} from './metrics';

const tx = (
  kind: 'income' | 'expense',
  category: string,
  amount: number,
  date = '2025-06-10',
): TransactionInput =>
  ({ kind, category, amount, date, propertyId: 'p', unitId: null }) as TransactionInput;

describe('ratio helpers', () => {
  it('compute the textbook definitions', () => {
    expect(grossYield(12_000, 200_000)).toBeCloseTo(0.06);
    expect(netYield(9_600, 204_000)).toBeCloseTo(0.04706, 5);
    expect(dscr(9_600, 8_000)).toBeCloseTo(1.2);
    expect(ltv(88_000, 220_000)).toBeCloseTo(0.4);
    expect(freeCashFlow(9_600, 8_000, 1_000)).toBe(600);
  });

  it('return null for a zero denominator', () => {
    expect(dscr(9_600, 0)).toBeNull();
    expect(ltv(0, 0)).toBeNull();
    expect(grossYield(12_000, 0)).toBeNull();
  });
});

describe('summarizeOperations', () => {
  it('keeps capital expenditure out of NOI', () => {
    const summary = summarizeOperations([
      tx('income', 'rent', 1_000),
      tx('income', 'parking', 100),
      tx('income', 'service_charges', 50),
      tx('expense', 'management', 200),
      tx('expense', 'land_tax', 30),
      tx('expense', 'capex', 5_000),
    ]);
    expect(summary).toEqual({
      rentalIncome: 1_100,
      otherIncome: 50,
      grossIncome: 1_150,
      operatingExpenses: 230,
      capex: 5_000,
      noi: 920,
    });
  });
});

describe('propertyPerformance', () => {
  // 0% loan so debt service is easy to verify: 1 000 € principal per month.
  const loan: LoanInput = {
    propertyId: 'p',
    lender: 'Näidispank AS',
    principal: 100_000,
    startDate: '2025-01-01',
    termMonths: 100,
    repaymentType: 'equal_principal',
    rateType: 'fixed',
    fixedRate: 0,
  };
  const transactions = [
    ...Array.from({ length: 12 }, () => tx('income', 'rent', 1_000)),
    tx('expense', 'maintenance', 2_400),
    tx('expense', 'capex', 1_000),
  ];
  const result = propertyPerformance({
    property: { purchasePrice: 200_000, acquisitionCosts: 4_000, marketValue: 220_000 },
    transactions,
    loans: [loan],
    period: { from: '2025-02-01', to: '2026-01-31' },
  });

  it('computes NOI, debt service and free cash flow', () => {
    expect(result.noi).toBe(9_600);
    expect(result.debtService).toBeCloseTo(12_000, 6);
    expect(result.freeCashFlow).toBeCloseTo(9_600 - 12_000 - 1_000, 6);
    expect(result.monthlyNoi).toBe(800);
    expect(result.monthlyFreeCashFlow).toBeCloseTo(-3_400 / 12, 6);
  });

  it('computes yields, DSCR and LTV', () => {
    expect(result.grossYield).toBeCloseTo(0.06);
    expect(result.netYield).toBeCloseTo(9_600 / 204_000);
    expect(result.netYieldOnValue).toBeCloseTo(9_600 / 220_000);
    expect(result.dscr).toBeCloseTo(0.8);
    expect(result.loanBalance).toBeCloseTo(88_000, 6);
    expect(result.ltv).toBeCloseTo(0.4);
  });

  it('has no DSCR or LTV without loans', () => {
    const unlevered = propertyPerformance({
      property: { purchasePrice: 200_000, acquisitionCosts: 4_000, marketValue: 220_000 },
      transactions,
      loans: [],
      period: { from: '2025-02-01', to: '2026-01-31' },
    });
    expect(unlevered.dscr).toBeNull();
    expect(unlevered.ltv).toBe(0);
    expect(unlevered.freeCashFlow).toBe(8_600);
  });

  it('combines properties by recomputing ratios from totals', () => {
    const combined = combinePerformance([result, result]);
    expect(combined.noi).toBe(19_200);
    expect(combined.loanBalance).toBeCloseTo(176_000, 6);
    expect(combined.dscr).toBeCloseTo(0.8);
    expect(combined.ltv).toBeCloseTo(0.4);
  });
});
