import { describe, expect, it } from 'vitest';
import type { LoanInput, TransactionInput } from '../types';
import { totalsByCategory, yearStatements } from './ledger';

const tx = (
  kind: 'income' | 'expense',
  category: string,
  date: string,
  amount: number,
): TransactionInput =>
  ({
    kind,
    category,
    date,
    amount,
    propertyId: 'p',
    unitId: null,
    leaseId: null,
    source: 'manual',
  }) as TransactionInput;

// 0% loan: 1 000 € principal on the 1st of every month from February 2026.
const loan: LoanInput = {
  propertyId: 'p',
  lender: 'Näidispank AS',
  principal: 120_000,
  startDate: '2026-01-01',
  termMonths: 120,
  repaymentType: 'equal_principal',
  rateType: 'fixed',
  fixedRate: 0,
};

const transactions = [
  tx('income', 'rent', '2026-02-05', 2_000),
  tx('income', 'service_charges', '2026-02-05', 200),
  tx('expense', 'utilities', '2026-02-10', 300),
  tx('expense', 'repairs', '2026-02-20', 100),
  tx('expense', 'capex', '2026-02-25', 5_000),
  tx('expense', 'loan_payment', '2026-02-01', 1_000),
  tx('income', 'rent', '2025-12-05', 2_000), // other year
];

describe('yearStatements', () => {
  const { months, total } = yearStatements({ transactions, loans: [loan], year: 2026 });
  const february = months[1];

  it('produces twelve months', () => {
    expect(months.map((m) => m.period)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('separates operating expenses, capital expenditure and loan payments', () => {
    expect(february).toMatchObject({
      rentalIncome: 2_000,
      otherIncome: 200,
      grossIncome: 2_200,
      operatingExpenses: 400,
      noi: 1_800,
      capex: 5_000,
      debtService: 1_000,
      recordedLoanPayments: 1_000,
      cashFlow: 1_800 - 5_000 - 1_000,
    });
  });

  it('takes debt service from the schedule even for months without recorded payments', () => {
    expect(months[2]?.debtService).toBe(1_000);
    expect(months[2]?.recordedLoanPayments).toBe(0);
    expect(months[0]?.debtService).toBe(0); // first payment is one month after the start
  });

  it('adds up the annual total and ignores other years', () => {
    expect(total.period).toBe('2026');
    expect(total.grossIncome).toBe(2_200);
    expect(total.debtService).toBe(11_000);
    expect(total.noi).toBe(months.reduce((s, m) => s + m.noi, 0));
  });
});

describe('yearStatements with an as-of date', () => {
  const { months, total } = yearStatements({
    transactions,
    loans: [loan],
    year: 2026,
    asOf: '2026-03-15',
  });

  it('marks later months as future and leaves out their loan payments', () => {
    expect(months[3]).toMatchObject({ future: true, debtService: 0 });
    expect(months[2]).toMatchObject({ future: false, debtService: 1_000 });
  });

  it('totals the year to date', () => {
    expect(total.debtService).toBe(2_000); // February and March
  });
});

describe('totalsByCategory', () => {
  it('groups amounts by category', () => {
    const { income, expenses } = totalsByCategory(transactions);
    expect(income.get('rent')).toBe(4_000);
    expect(expenses.get('capex')).toBe(5_000);
  });
});
