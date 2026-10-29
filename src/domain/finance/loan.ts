import { addMonths, daysBetween, fromIsoDate, toIsoDate } from '../dates';
import type { EuriborTenor, LoanInput } from '../types';

/*
 * Loan amortisation.
 *
 * - Rate: fixed, or Euribor + bank margin. Both parts are kept separately on every row.
 *   The variable rate resets every 3 or 6 months (the Euribor tenor), counted from the loan
 *   start, using the Euribor on the reset date. Negative Euribor counts as 0, as in most
 *   Estonian loan agreements.
 * - Interest per payment:
 *     30/360:  balance × rate / 12
 *     act/360: balance × rate × actual days since the previous payment / 360
 *   The annuity payment is always computed with rate / 12 and stays fixed between resets; with
 *   act/360 the principal part absorbs the day-count difference, as banks do.
 * - Annuity loans recalculate the payment from the remaining balance and term at every
 *   Euribor reset (variable loans), when a fixed rate changes, and when an actual balance is
 *   applied; equal-principal loans repay the remaining balance evenly over the remaining
 *   payments.
 * - Actual balance: when the bank's balance is entered, the schedule continues from that
 *   amount after the last payment on or before its date. Rows before it are calculated
 *   history; rows after it are projections from the actual figure.
 * - The first payment is one month after the start date; the last payment clears the balance.
 */

export const tenorMonths: Record<EuriborTenor, number> = { '3M': 3, '6M': 6 };

/** Standard terms offered in the forms and term comparison, in years. */
export const standardTermYears = [19, 20, 24, 25] as const;

export interface ScheduleRow {
  period: number;
  /** Payment date (ISO). */
  date: string;
  /** Days of interest in this period (30 under 30/360). */
  days: number;
  /** Euribor used (after the 0 floor); null for fixed-rate loans. */
  euribor: number | null;
  /** Bank margin; null for fixed-rate loans. */
  margin: number | null;
  annualRate: number;
  payment: number;
  interest: number;
  /** Part of the interest due to Euribor / to the margin (fixed loans: all margin = 0). */
  interestEuribor: number;
  interestMargin: number;
  principal: number;
  /** Balance after this payment. */
  balance: number;
  /** This row starts from the bank's actual balance (opening balance replaced). */
  startsFromActual: boolean;
  /** Balance follows from the actual balance rather than from the original principal. */
  basedOnActual: boolean;
}

/** A fixed Euribor, or a function returning the Euribor on a given ISO date. */
export type EuriborSource = number | ((isoDate: string) => number);

export interface RateParts {
  euribor: number | null;
  margin: number | null;
  annualRate: number;
}

/** `marginDelta` shifts the bank margin of a variable loan (what-if scenarios). */
export function rateParts(loan: LoanInput, euribor: number, marginDelta = 0): RateParts {
  if (loan.rateType === 'fixed') return { euribor: null, margin: null, annualRate: loan.fixedRate };
  const floored = Math.max(0, euribor);
  const margin = Math.max(0, loan.margin + marginDelta);
  return { euribor: floored, margin, annualRate: floored + margin };
}

export function annualInterestRate(loan: LoanInput, euribor: number): number {
  return rateParts(loan, euribor).annualRate;
}

/** Monthly annuity payment for `balance` repaid over `months`. */
export function annuityPayment(balance: number, monthlyRate: number, months: number): number {
  if (months <= 0) return balance;
  if (monthlyRate === 0) return balance / months;
  return (balance * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

/** Full repayment schedule. Without `euribor`, the loan's stored Euribor is used throughout. */
export interface ScheduleOptions {
  /** Margin change in effect on a reset date (variable loans only), e.g. from a forecast start. */
  marginDelta?: (isoDate: string) => number;
}

export function amortizationSchedule(
  loan: LoanInput,
  euribor?: EuriborSource,
  options: ScheduleOptions = {},
): ScheduleRow[] {
  const marginDeltaAt = options.marginDelta ?? (() => 0);
  const start = fromIsoDate(loan.startDate);
  const storedEuribor = loan.rateType === 'euribor' ? loan.euribor : 0;
  const euriborAt = typeof euribor === 'function' ? euribor : () => euribor ?? storedEuribor;
  const resetEvery = loan.rateType === 'euribor' ? tenorMonths[loan.euriborTenor] : Infinity;
  const actual = loan.actualBalance ?? null;

  const rows: ScheduleRow[] = [];
  let balance = loan.principal;
  let rate: RateParts = { euribor: null, margin: null, annualRate: 0 };
  let annuity = 0;
  let equalPrincipal = loan.principal / loan.termMonths;
  let previousDate = loan.startDate;
  let basedOnActual = false;

  for (let period = 1; period <= loan.termMonths; period++) {
    const date = toIsoDate(addMonths(start, period));
    const remaining = loan.termMonths - period + 1;

    if (period === 1 || (period - 1) % resetEvery === 0) {
      const resetDate = toIsoDate(addMonths(start, period - 1));
      const next = rateParts(loan, euriborAt(resetDate), marginDeltaAt(resetDate));
      // Variable loans are re-amortised at every reset, as banks do; this also keeps act/360
      // day-count drift from piling up into the last payment.
      if (period === 1 || loan.rateType === 'euribor' || next.annualRate !== rate.annualRate) {
        annuity = annuityPayment(balance, next.annualRate / 12, remaining);
      }
      rate = next;
    }

    // The actual balance applies from the first payment after its date.
    let startsFromActual = false;
    if (actual && !basedOnActual && actual.date < date) {
      balance = actual.amount;
      annuity = annuityPayment(balance, rate.annualRate / 12, remaining);
      equalPrincipal = balance / remaining;
      basedOnActual = true;
      startsFromActual = true;
    }
    if (balance <= 0) break;

    const days = loan.dayCount === 'act/360' ? daysBetween(previousDate, date) : 30;
    const interest =
      loan.dayCount === 'act/360'
        ? (balance * rate.annualRate * days) / 360
        : (balance * rate.annualRate) / 12;
    let principal = loan.repaymentType === 'annuity' ? annuity - interest : equalPrincipal;
    if (period === loan.termMonths || principal > balance) principal = balance;
    principal = Math.max(0, principal);
    balance -= principal;

    const euriborShare =
      rate.euribor !== null && rate.annualRate > 0 ? rate.euribor / rate.annualRate : 0;
    rows.push({
      period,
      date,
      days,
      euribor: rate.euribor,
      margin: rate.margin,
      annualRate: rate.annualRate,
      payment: principal + interest,
      interest,
      interestEuribor: interest * euriborShare,
      interestMargin: interest * (1 - euriborShare),
      principal,
      balance: Math.max(0, balance),
      startsFromActual,
      basedOnActual,
    });
    previousDate = date;
  }
  return rows;
}

/**
 * Outstanding balance on `date`: after all payments due on or before it, or the bank's actual
 * balance when that is the latest known figure.
 */
export function balanceOn(
  loan: Pick<LoanInput, 'principal' | 'actualBalance'>,
  schedule: ScheduleRow[],
  date: string,
): number {
  let balance = loan.principal;
  let lastPaymentDate = '';
  for (const row of schedule) {
    if (row.date > date) break;
    balance = row.balance;
    lastPaymentDate = row.date;
  }
  const actual = loan.actualBalance;
  if (actual && actual.date <= date && actual.date >= lastPaymentDate) return actual.amount;
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

/** How a balance figure was obtained. */
export type BalanceBasis =
  /** Entered from the bank, no payments since. */
  | 'actual'
  /** Calculated forward from an entered actual balance. */
  | 'fromActual'
  /** Calculated from the original principal; no actual balance entered. */
  | 'calculated';

export interface LoanPosition {
  balance: number;
  basis: BalanceBasis;
  actual: { amount: number; date: string } | null;
  /** What the schedule without the actual balance gives for the actual balance's date. */
  calculatedAtActualDate: number | null;
  /** actual − calculated; positive = more debt than the original schedule expects. */
  difference: number | null;
  currentRate: RateParts | null;
  nextPayment: ScheduleRow | null;
  paymentsMade: number;
  paymentsLeft: number;
  endDate: string | null;
}

/** Where a loan stands on `today`, with actual and calculated figures kept apart. */
export function loanPosition(loan: LoanInput, today: string): LoanPosition {
  const schedule = amortizationSchedule(loan);
  const actual = loan.actualBalance ?? null;
  const made = schedule.filter((r) => r.date <= today);
  const next = schedule.find((r) => r.date > today) ?? null;
  const lastPayment = made.at(-1)?.date ?? '';

  let calculatedAtActualDate: number | null = null;
  if (actual) {
    const original = amortizationSchedule({ ...loan, actualBalance: null });
    calculatedAtActualDate = balanceOn({ ...loan, actualBalance: null }, original, actual.date);
  }

  const basis: BalanceBasis = !actual
    ? 'calculated'
    : actual.date >= lastPayment && actual.date <= today
      ? 'actual'
      : 'fromActual';

  return {
    balance: balanceOn(loan, schedule, today),
    basis,
    actual,
    calculatedAtActualDate,
    difference:
      actual && calculatedAtActualDate !== null ? actual.amount - calculatedAtActualDate : null,
    currentRate: next
      ? { euribor: next.euribor, margin: next.margin, annualRate: next.annualRate }
      : null,
    nextPayment: next,
    paymentsMade: made.length,
    paymentsLeft: schedule.length - made.length,
    endDate: schedule.at(-1)?.date ?? null,
  };
}

/** Yearly totals of a schedule, e.g. for a compact schedule view. */
export function yearlySchedule(schedule: readonly ScheduleRow[]) {
  const years = new Map<
    string,
    { year: string; payment: number; interest: number; principal: number; endBalance: number }
  >();
  for (const row of schedule) {
    const year = row.date.slice(0, 4);
    const entry = years.get(year) ?? { year, payment: 0, interest: 0, principal: 0, endBalance: 0 };
    entry.payment += row.payment;
    entry.interest += row.interest;
    entry.principal += row.principal;
    entry.endBalance = row.balance;
    years.set(year, entry);
  }
  return [...years.values()];
}
