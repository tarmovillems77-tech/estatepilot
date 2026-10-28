import { describe, expect, it } from 'vitest';
import type { LoanInput } from '../types';
import {
  amortizationSchedule,
  annualInterestRate,
  annuityPayment,
  balanceOn,
  paymentsBetween,
} from './loan';

const base = {
  propertyId: 'p',
  lender: 'Näidispank AS',
  principal: 120_000,
  startDate: '2026-01-15',
  termMonths: 120,
} as const;

const fixedAnnuity: LoanInput = {
  ...base,
  repaymentType: 'annuity',
  rateType: 'fixed',
  fixedRate: 0.05,
};
const euriborEqual: LoanInput = {
  ...base,
  repaymentType: 'equal_principal',
  rateType: 'euribor',
  margin: 0.02,
  euribor: 0.025,
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('annuityPayment', () => {
  it('matches the standard annuity formula', () => {
    // 100 000 € at 5% over 30 years → 536.82 € per month
    expect(annuityPayment(100_000, 0.05 / 12, 360)).toBeCloseTo(536.82, 2);
  });

  it('splits evenly without interest', () => {
    expect(annuityPayment(12_000, 0, 12)).toBe(1_000);
  });
});

describe('annualInterestRate', () => {
  it('adds 3M Euribor to the margin', () => {
    expect(annualInterestRate(euriborEqual, 0.025)).toBeCloseTo(0.045);
  });

  it('treats negative Euribor as zero', () => {
    expect(annualInterestRate(euriborEqual, -0.005)).toBeCloseTo(0.02);
  });

  it('ignores Euribor for fixed-rate loans', () => {
    expect(annualInterestRate(fixedAnnuity, 0.04)).toBe(0.05);
  });
});

describe('amortizationSchedule – annuity', () => {
  const schedule = amortizationSchedule(fixedAnnuity);

  it('has one row per month starting one month after the start date', () => {
    expect(schedule).toHaveLength(120);
    expect(schedule[0]?.date).toBe('2026-02-15');
    expect(schedule.at(-1)?.date).toBe('2036-01-15');
  });

  it('keeps a constant payment and repays the loan exactly', () => {
    const payment = annuityPayment(120_000, 0.05 / 12, 120);
    expect(schedule.every((row) => Math.abs(row.payment - payment) < 1e-6)).toBe(true);
    expect(sum(schedule.map((r) => r.principal))).toBeCloseTo(120_000, 6);
    expect(schedule.at(-1)?.balance).toBe(0);
  });

  it('charges a month of interest on the opening balance', () => {
    expect(schedule[0]?.interest).toBeCloseTo(500, 6); // 120 000 × 5% / 12
  });
});

describe('amortizationSchedule – equal principal', () => {
  const schedule = amortizationSchedule(euriborEqual);

  it('repays the same principal every month with falling interest', () => {
    expect(schedule.every((row) => Math.abs(row.principal - 1_000) < 1e-6)).toBe(true);
    expect(schedule[0]?.payment).toBeCloseTo(1_000 + 450, 6); // 120 000 × 4.5% / 12 = 450
    expect(schedule[1]?.interest).toBeLessThan(schedule[0]?.interest ?? 0);
    expect(schedule.at(-1)?.balance).toBe(0);
  });
});

describe('amortizationSchedule – 3M Euribor resets', () => {
  // Euribor rises from 2% to 4% on 1 April 2026.
  const euribor = (date: string) => (date < '2026-04-01' ? 0.02 : 0.04);
  const annuityLoan: LoanInput = { ...euriborEqual, repaymentType: 'annuity' };
  const schedule = amortizationSchedule(annuityLoan, euribor);

  it('keeps the rate for whole 3-month periods counted from the loan start', () => {
    // Periods start 15.01, 15.04, …: the rise applies from the 4th payment.
    expect(schedule.slice(0, 3).every((row) => Math.abs(row.annualRate - 0.04) < 1e-12)).toBe(true);
    expect(schedule[3]?.annualRate).toBeCloseTo(0.06);
  });

  it('recalculates the annuity payment and still repays the loan', () => {
    expect(schedule[3]?.payment).toBeGreaterThan(schedule[2]?.payment ?? Infinity);
    expect(schedule[4]?.payment).toBeCloseTo(schedule[3]?.payment ?? 0, 6);
    expect(sum(schedule.map((r) => r.principal))).toBeCloseTo(120_000, 6);
    expect(schedule.at(-1)?.balance).toBe(0);
  });

  it('accepts a constant Euribor override', () => {
    expect(amortizationSchedule(annuityLoan, 0.01)[0]?.annualRate).toBeCloseTo(0.03);
  });
});

describe('balanceOn and paymentsBetween', () => {
  const schedule = amortizationSchedule(euriborEqual);

  it('returns the original principal before the first payment', () => {
    expect(balanceOn(euriborEqual, schedule, '2026-02-14')).toBe(120_000);
  });

  it('counts payments up to and including the date', () => {
    expect(balanceOn(euriborEqual, schedule, '2026-04-15')).toBeCloseTo(117_000, 6);
    expect(balanceOn(euriborEqual, schedule, '2040-01-01')).toBe(0);
  });

  it('sums payments within an inclusive range', () => {
    const totals = paymentsBetween(schedule, '2026-02-15', '2026-04-15');
    expect(totals.principal).toBeCloseTo(3_000, 6);
    expect(totals.payment).toBeCloseTo(totals.principal + totals.interest, 6);
  });
});
