import { addMonths, fromIsoDate, toIsoDate } from '../dates';
import type { EuriborTenor, LoanInput, RepaymentType } from '../types';
import { amortizationSchedule, balanceOn, standardTermYears, type ScheduleRow } from './loan';

/*
 * What-if calculations on a loan. Nothing here changes stored data.
 *
 * Term comparison: the same loan (principal, start, rate) repaid over 19, 20, 24 or 25 years.
 * Refinancing: on `atDate` the projected balance is moved to a new loan with new terms;
 * one-off fees are paid separately (not added to the loan) and counted as a cost.
 */

const sum = (rows: readonly ScheduleRow[], key: 'interest' | 'payment') =>
  rows.reduce((total, row) => total + row[key], 0);

export interface TermOption {
  years: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  endDate: string;
}

/** First regular payment and lifetime totals for each term, from the original principal. */
export function compareTerms(
  loan: LoanInput,
  years: readonly number[] = standardTermYears,
): TermOption[] {
  return years.map((y) => {
    const schedule = amortizationSchedule({ ...loan, termMonths: y * 12, actualBalance: null });
    return {
      years: y,
      monthlyPayment: schedule[0]?.payment ?? 0,
      totalInterest: sum(schedule, 'interest'),
      totalPaid: sum(schedule, 'payment'),
      endDate: schedule.at(-1)?.date ?? loan.startDate,
    };
  });
}

export interface RefinanceTerms {
  /** Date of refinancing (ISO). */
  atDate: string;
  termMonths: number;
  repaymentType: RepaymentType;
  euriborTenor: EuriborTenor;
  /** Euribor assumed for both loans after `atDate`. */
  euribor: number;
  margin: number;
  /** One-off costs: contract fee, notary, mortgage change. */
  fees: number;
}

/**
 * Default scenario: refinance in 5 years at today's margin over the term still left then, so
 * the comparison shows the effect of the new rate terms alone. Change the term to compare
 * a longer or shorter loan.
 */
export function defaultRefinanceTerms(loan: LoanInput, today: string): RefinanceTerms {
  const inFiveYears = addMonths(fromIsoDate(today), 60);
  const atDate = toIsoDate(new Date(inFiveYears.getFullYear(), inFiveYears.getMonth(), 1));
  return {
    atDate,
    termMonths: Math.max(1, remainingPayments(loan, atDate)),
    repaymentType: loan.repaymentType,
    euriborTenor: loan.rateType === 'euribor' ? loan.euriborTenor : '6M',
    euribor: loan.rateType === 'euribor' ? loan.euribor : FIXED_LOAN_EURIBOR,
    // A fixed-rate loan starts from the same total rate (Euribor + margin = fixed rate).
    margin:
      loan.rateType === 'euribor' ? loan.margin : Math.max(0, loan.fixedRate - FIXED_LOAN_EURIBOR),
    fees: 0,
  };
}

/** Scheduled payments after `date`. */
export function remainingPayments(loan: LoanInput, date: string): number {
  return amortizationSchedule(loan).filter((r) => r.date > date).length;
}

/** Euribor assumed when a fixed-rate loan is refinanced into a variable one. */
const FIXED_LOAN_EURIBOR = 0.025;

export interface LoanOutcome {
  /** Balance moved on the refinancing date. */
  balanceAtRefinance: number;
  annualRate: number;
  euribor: number | null;
  margin: number | null;
  firstPayment: number;
  /** Interest in the first 60 months after the refinancing date. */
  interestFiveYears: number;
  /** Interest from the refinancing date until the loan is repaid. */
  interestToEnd: number;
  endDate: string | null;
  fees: number;
}

export interface RefinanceComparison {
  current: LoanOutcome;
  refinanced: LoanOutcome;
  /** Positive = refinancing is cheaper (interest to end + fees). */
  savingToEnd: number;
  /** Positive = refinancing lowers the monthly payment. */
  paymentChange: number;
  newLoan: LoanInput;
}

function outcome(rows: readonly ScheduleRow[], atDate: string, balance: number, fees: number) {
  const fiveYearsLater = toIsoDate(addMonths(fromIsoDate(atDate), 60));
  const first = rows[0];
  return {
    balanceAtRefinance: balance,
    annualRate: first?.annualRate ?? 0,
    euribor: first?.euribor ?? null,
    margin: first?.margin ?? null,
    firstPayment: first?.payment ?? 0,
    interestFiveYears: sum(
      rows.filter((r) => r.date <= fiveYearsLater),
      'interest',
    ),
    interestToEnd: sum(rows, 'interest'),
    endDate: rows.at(-1)?.date ?? null,
    fees,
  };
}

export function compareRefinancing(loan: LoanInput, terms: RefinanceTerms): RefinanceComparison {
  // Both loans use the scenario Euribor from the refinancing date on.
  const euriborAt = (date: string) =>
    date >= terms.atDate ? terms.euribor : loan.rateType === 'euribor' ? loan.euribor : 0;
  const currentRows = amortizationSchedule(loan, euriborAt);
  const balance = balanceOn(loan, currentRows, terms.atDate);

  const newLoan: LoanInput = {
    rateType: 'euribor',
    propertyId: loan.propertyId,
    lender: loan.lender,
    principal: Math.max(balance, 0.01),
    startDate: terms.atDate,
    termMonths: terms.termMonths,
    repaymentType: terms.repaymentType,
    dayCount: loan.dayCount,
    actualBalance: null,
    margin: terms.margin,
    euribor: terms.euribor,
    euriborTenor: terms.euriborTenor,
  };

  const current = outcome(
    currentRows.filter((r) => r.date > terms.atDate),
    terms.atDate,
    balance,
    0,
  );
  const refinanced = outcome(amortizationSchedule(newLoan), terms.atDate, balance, terms.fees);

  return {
    current,
    refinanced,
    savingToEnd: current.interestToEnd - (refinanced.interestToEnd + terms.fees),
    paymentChange: current.firstPayment - refinanced.firstPayment,
    newLoan,
  };
}
