import { addMonths, fromIsoDate, toIsoDate } from '../dates';
import type { LoanInput } from '../types';

/*
 * Loan amortisation.
 *
 * - Interest: monthly rate = annual rate / 12 (30/360 convention).
 * - Variable loans: 3-month Euribor + bank margin. The rate is fixed for 3-month interest
 *   periods counted from the loan start and reset from the Euribor on the period's first day.
 *   Negative Euribor counts as 0, as in most Estonian loan agreements.
 * - Annuity loans recalculate the payment from the remaining balance and term whenever the
 *   rate changes; equal-principal loans repay principal / term every month.
 * - The first payment is one month after the start date.
 */

export const EURIBOR_RESET_MONTHS = 3;

export interface ScheduleRow {
  period: number;
  /** Payment date (ISO). */
  date: string;
  annualRate: number;
  payment: number;
  interest: number;
  principal: number;
  /** Balance after this payment. */
  balance: number;
}

/** A fixed Euribor, or a function returning the 3M Euribor on a given ISO date. */
export type EuriborSource = number | ((isoDate: string) => number);

export function annualInterestRate(loan: LoanInput, euribor: number): number {
  return loan.rateType === 'fixed' ? loan.fixedRate : loan.margin + Math.max(0, euribor);
}

/** Monthly annuity payment for `balance` repaid over `months`. */
export function annuityPayment(balance: number, monthlyRate: number, months: number): number {
  if (months <= 0) return balance;
  if (monthlyRate === 0) return balance / months;
  return (balance * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

/** Full repayment schedule. Without `euribor`, the loan's stored Euribor is used throughout. */
export function amortizationSchedule(loan: LoanInput, euribor?: EuriborSource): ScheduleRow[] {
  const start = fromIsoDate(loan.startDate);
  const storedEuribor = loan.rateType === 'euribor' ? loan.euribor : 0;
  const euriborAt = typeof euribor === 'function' ? euribor : () => euribor ?? storedEuribor;
  const equalPrincipal = loan.principal / loan.termMonths;

  const rows: ScheduleRow[] = [];
  let balance = loan.principal;
  let rate = 0;
  let annuity = 0;

  for (let period = 1; period <= loan.termMonths; period++) {
    if ((period - 1) % EURIBOR_RESET_MONTHS === 0) {
      const resetDate = toIsoDate(addMonths(start, period - 1));
      const newRate = annualInterestRate(loan, euriborAt(resetDate));
      if (period === 1 || newRate !== rate) {
        rate = newRate;
        annuity = annuityPayment(balance, rate / 12, loan.termMonths - period + 1);
      }
    }

    const interest = (balance * rate) / 12;
    let principal = loan.repaymentType === 'annuity' ? annuity - interest : equalPrincipal;
    if (period === loan.termMonths || principal > balance) principal = balance;
    balance -= principal;

    rows.push({
      period,
      date: toIsoDate(addMonths(start, period)),
      annualRate: rate,
      payment: principal + interest,
      interest,
      principal,
      balance: Math.max(0, balance),
    });
  }
  return rows;
}

/** Outstanding balance after all payments due on or before `date`. */
export function balanceOn(
  loan: Pick<LoanInput, 'principal'>,
  schedule: ScheduleRow[],
  date: string,
): number {
  let balance = loan.principal;
  for (const row of schedule) {
    if (row.date > date) break;
    balance = row.balance;
  }
  return balance;
}

export interface PaymentTotals {
  payment: number;
  interest: number;
  principal: number;
}

/** Sums the payments due within an inclusive ISO date range. */
export function paymentsBetween(schedule: ScheduleRow[], from: string, to: string): PaymentTotals {
  const totals: PaymentTotals = { payment: 0, interest: 0, principal: 0 };
  for (const row of schedule) {
    if (row.date < from || row.date > to) continue;
    totals.payment += row.payment;
    totals.interest += row.interest;
    totals.principal += row.principal;
  }
  return totals;
}
