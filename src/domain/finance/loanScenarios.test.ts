import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo';
import type { LoanInput } from '../types';
import {
  amortizationSchedule,
  annuityPayment,
  balanceOn,
  loanPosition,
  rateParts,
  yearlySchedule,
} from './loan';
import { portfolioPerformance } from './portfolio';
import { compareRefinancing, compareTerms, defaultRefinanceTerms } from './refinance';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const variable: LoanInput = {
  propertyId: 'p',
  lender: 'Näidispank AS',
  principal: 100_000,
  startDate: '2026-01-15',
  termMonths: 240,
  repaymentType: 'annuity',
  rateType: 'euribor',
  euriborTenor: '6M',
  margin: 0.02,
  euribor: 0.016,
  dayCount: '30/360',
  actualBalance: null,
};

// Expected payments were checked independently by simulating the balance month by month
// (bisection on the payment), not with the annuity formula used in the code.
describe('standard payments for 19, 20, 24 and 25 years', () => {
  it.each([
    [19, 1_880.61],
    [20, 1_817.94],
    [24, 1_622.07],
    [25, 1_583.51],
  ])('300 000 € at 4 percent over %i years costs %f € per month', (years, payment) => {
    expect(annuityPayment(300_000, 0.04 / 12, years * 12)).toBeCloseTo(payment, 2);
  });

  it('compares 19, 20, 24 and 25 year terms of the same loan', () => {
    const options = compareTerms({ ...variable, principal: 300_000, euribor: 0.02 });
    expect(options.map((o) => o.years)).toEqual([19, 20, 24, 25]);
    expect(options[1]?.monthlyPayment).toBeCloseTo(1_817.94, 1);
    // Longer term: lower payment, more interest in total.
    for (let i = 1; i < options.length; i++) {
      expect(options[i]!.monthlyPayment).toBeLessThan(options[i - 1]!.monthlyPayment);
      expect(options[i]!.totalInterest).toBeGreaterThan(options[i - 1]!.totalInterest);
    }
    expect(options[3]?.endDate).toBe('2051-01-15');
  });
});

describe('Euribor and margin', () => {
  it('keeps both parts on every row and splits the interest', () => {
    const [first] = amortizationSchedule(variable);
    expect(first).toMatchObject({ euribor: 0.016, margin: 0.02 });
    expect(first?.annualRate).toBeCloseTo(0.036);
    expect(first?.interest).toBeCloseTo(300, 6); // 100 000 × 3,6% / 12
    expect(first?.interestEuribor).toBeCloseTo((300 * 0.016) / 0.036, 6);
    expect((first?.interestEuribor ?? 0) + (first?.interestMargin ?? 0)).toBeCloseTo(300, 6);
  });

  it('floors negative Euribor at 0 but keeps the margin', () => {
    expect(rateParts(variable, -0.004)).toEqual({ euribor: 0, margin: 0.02, annualRate: 0.02 });
  });

  it('has no Euribor or margin parts for fixed-rate loans', () => {
    const fixed: LoanInput = { ...variable, rateType: 'fixed', fixedRate: 0.05 } as LoanInput;
    const [first] = amortizationSchedule(fixed);
    expect(first).toMatchObject({ euribor: null, margin: null, annualRate: 0.05 });
    expect(first?.interestEuribor).toBe(0);
  });

  it('resets a 6M loan every six months and a 3M loan every three', () => {
    const rising = (date: string) => (date < '2026-05-01' ? 0.01 : 0.03);
    const sixMonth = amortizationSchedule(variable, rising);
    const threeMonth = amortizationSchedule({ ...variable, euriborTenor: '3M' }, rising);
    // Resets on 15.01, 15.04 (3M) / 15.07 (6M): the rise is first used on 15.07.
    expect(threeMonth.slice(0, 6).map((r) => r.euribor)).toEqual([
      0.01, 0.01, 0.01, 0.01, 0.01, 0.01,
    ]);
    expect(threeMonth[6]?.euribor).toBe(0.03);
    expect(sixMonth[5]?.euribor).toBe(0.01);
    expect(sixMonth[6]?.euribor).toBe(0.03);
  });
});

describe('act/360 interest', () => {
  const act: LoanInput = { ...variable, dayCount: 'act/360', euribor: 0.016 };
  const rows = amortizationSchedule(act);

  it('charges interest for the actual days between payments', () => {
    // 15.01 → 15.02: 31 days; 15.02 → 15.03: 28 days.
    expect(rows[0]?.days).toBe(31);
    expect(rows[0]?.interest).toBeCloseTo((100_000 * 0.036 * 31) / 360, 6);
    expect(rows[1]?.days).toBe(28);
    expect(rows[1]?.interest).toBeLessThan(rows[0]?.interest ?? 0);
  });

  it('keeps the annuity payment fixed and repays the loan exactly', () => {
    const regular = annuityPayment(100_000, 0.036 / 12, 240);
    expect(rows.slice(0, 6).every((r) => Math.abs(r.payment - regular) < 1e-6)).toBe(true);
    expect(sum(rows.map((r) => r.principal))).toBeCloseTo(100_000, 6);
    expect(rows.at(-1)?.balance).toBe(0);
  });

  it('costs more interest over a year than 30/360 (365 days vs 360)', () => {
    const thirty = amortizationSchedule(variable);
    const yearInterest = (r: typeof rows) => sum(r.slice(0, 12).map((x) => x.interest));
    expect(yearInterest(rows)).toBeGreaterThan(yearInterest(thirty));
  });
});

describe('actual balance from the bank', () => {
  const withActual: LoanInput = {
    ...variable,
    actualBalance: { amount: 95_000, date: '2027-03-01' },
  };
  const original = amortizationSchedule(variable);
  const anchored = amortizationSchedule(withActual);

  it('leaves earlier rows as calculated and continues from the actual amount', () => {
    // Payments on 15.01.2027 and 15.02.2027 are before the date; 15.03.2027 starts from 95 000.
    const index = anchored.findIndex((r) => r.startsFromActual);
    expect(anchored[index]?.date).toBe('2027-03-15');
    expect(anchored.slice(0, index)).toEqual(original.slice(0, index));
    expect(anchored[index]?.interest).toBeCloseTo((95_000 * 0.036) / 12, 6);
    expect(anchored.slice(index).every((r) => r.basedOnActual)).toBe(true);
    expect(anchored.at(-1)?.balance).toBe(0);
    expect(anchored).toHaveLength(240);
  });

  it('reports the actual figure until the next payment, then a calculated one', () => {
    expect(balanceOn(withActual, anchored, '2027-03-01')).toBe(95_000);
    expect(balanceOn(withActual, anchored, '2027-03-14')).toBe(95_000);
    expect(balanceOn(withActual, anchored, '2027-03-15')).toBeLessThan(95_000);
  });

  it('separates actual, derived and calculated balances in the loan position', () => {
    const atDate = loanPosition(withActual, '2027-03-10');
    expect(atDate.basis).toBe('actual');
    expect(atDate.balance).toBe(95_000);
    expect(atDate.difference).toBeCloseTo(95_000 - balanceOn(variable, original, '2027-03-01'), 6);

    expect(loanPosition(withActual, '2027-06-01').basis).toBe('fromActual');
    expect(loanPosition(variable, '2027-06-01')).toMatchObject({
      basis: 'calculated',
      actual: null,
      difference: null,
    });
  });

  it('tracks payments made and left', () => {
    const position = loanPosition(variable, '2026-07-01');
    expect(position.paymentsMade).toBe(5);
    expect(position.paymentsLeft).toBe(235);
    expect(position.nextPayment?.date).toBe('2026-07-15');
    expect(position.endDate).toBe('2046-01-15');
  });
});

describe('yearlySchedule', () => {
  it('adds up payments per calendar year', () => {
    const rows = amortizationSchedule(variable);
    const years = yearlySchedule(rows);
    expect(years[0]).toMatchObject({ year: '2026' });
    expect(sum(years.map((y) => y.principal))).toBeCloseTo(100_000, 6);
    expect(years.at(-1)?.endBalance).toBe(0);
  });
});

describe('refinancing after 5 years', () => {
  const loan: LoanInput = { ...variable, principal: 300_000, margin: 0.025, euribor: 0.022 };
  const terms = defaultRefinanceTerms(loan, '2026-10-29');

  it('defaults to five years from today at the current margin over the remaining term', () => {
    expect(terms).toMatchObject({
      atDate: '2031-10-01',
      // 240 payments from 15.02.2026; 68 are made by 01.10.2031.
      termMonths: 172,
      margin: 0.025,
      euribor: 0.022,
      euriborTenor: '6M',
      fees: 0,
    });
  });

  it('starts a fixed-rate loan at the same total rate', () => {
    const fixed = { ...loan, rateType: 'fixed', fixedRate: 0.0495 } as LoanInput;
    const fixedTerms = defaultRefinanceTerms(fixed, '2026-10-29');
    expect(fixedTerms.euribor + fixedTerms.margin).toBeCloseTo(0.0495, 10);
    expect(Math.abs(compareRefinancing(fixed, fixedTerms).savingToEnd)).toBeLessThan(5);
  });

  it('shows no saving when nothing changes', () => {
    const same = compareRefinancing(loan, terms);
    expect(same.savingToEnd).toBeCloseTo(0, 0);
    expect(same.paymentChange).toBeCloseTo(0, 0);
  });

  it('moves the projected balance to the new loan', () => {
    const result = compareRefinancing(loan, terms);
    const projected = balanceOn(loan, amortizationSchedule(loan), terms.atDate);
    expect(result.current.balanceAtRefinance).toBeCloseTo(projected, 6);
    expect(result.newLoan).toMatchObject({ startDate: '2031-10-01', termMonths: 172 });
    expect(result.newLoan.principal).toBeCloseTo(projected, 6);
  });

  it('shows the saving from a lower margin over the same remaining term, net of fees', () => {
    const remaining = amortizationSchedule(loan).filter((r) => r.date > terms.atDate).length;
    const cheaper = compareRefinancing(loan, {
      ...terms,
      termMonths: remaining,
      margin: 0.015,
      fees: 1_500,
    });
    expect(cheaper.refinanced.margin).toBe(0.015);
    expect(cheaper.paymentChange).toBeGreaterThan(0);
    expect(cheaper.savingToEnd).toBeCloseTo(
      cheaper.current.interestToEnd - cheaper.refinanced.interestToEnd - 1_500,
      6,
    );
    expect(cheaper.savingToEnd).toBeGreaterThan(0);
  });

  it('shows a longer term lowers the payment but costs more interest', () => {
    // Same margin, but restart at 25 years instead of the 15 years left.
    const longer = compareRefinancing(loan, { ...terms, termMonths: 300 });
    expect(longer.paymentChange).toBeGreaterThan(0);
    expect(longer.savingToEnd).toBeLessThan(0);
  });
});

describe('portfolio-level loans', () => {
  const asOf = new Date(2026, 9, 28);
  const demo = buildDemoData(asOf);
  const result = portfolioPerformance({ ...demo, asOf });

  it('count in the portfolio total but not in any property', () => {
    const portfolio = result.portfolioLoans;
    expect(portfolio?.loanBalance).toBeGreaterThan(0);
    const propertyDebt = sum([...result.byProperty.values()].map((p) => p.debtService));
    expect(result.total.debtService).toBeCloseTo(propertyDebt + (portfolio?.debtService ?? 0), 6);
    const propertyBalance = sum([...result.byProperty.values()].map((p) => p.loanBalance));
    expect(result.total.loanBalance).toBeCloseTo(
      propertyBalance + (portfolio?.loanBalance ?? 0),
      6,
    );
  });

  it('uses the bank balance for the Pärna loan', () => {
    const parna = demo.loans.find((l) => l.actualBalance !== null);
    expect(parna?.actualBalance?.date).toBe('2026-10-01');
    const parnaProperty = result.byProperty.get(parna?.propertyId ?? '');
    expect(parnaProperty?.loanBalance).toBe(parna?.actualBalance?.amount);
  });
});
