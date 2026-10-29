import { expenseGroupOf, type ExpenseCategory, type IncomeCategory } from '../categories';
import { dayBefore, fromIsoDate } from '../dates';
import type { LoanInput, TransactionInput } from '../types';
import { amortizationSchedule, paymentsBetween } from './loan';
import { summarizeOperations } from './metrics';

/*
 * Monthly and annual income/expense statements.
 *
 *   NOI        = gross income − operating expenses
 *   Cash flow  = NOI − capital expenditure − debt service
 *
 * Debt service comes from the loan schedules (interest and principal). Loan payments recorded
 * as transactions are reported separately (`recordedLoanPayments`) for reconciliation with the
 * bank statement and are never deducted a second time.
 */

export interface PeriodStatement {
  /** "YYYY-MM", or "YYYY" for the annual total. */
  period: string;
  /** The whole period lies after `asOf`: nothing has happened yet. */
  future: boolean;
  rentalIncome: number;
  otherIncome: number;
  grossIncome: number;
  operatingExpenses: number;
  noi: number;
  capex: number;
  interest: number;
  principal: number;
  debtService: number;
  recordedLoanPayments: number;
  cashFlow: number;
}

function statement(
  period: string,
  transactions: readonly TransactionInput[],
  debt: { interest: number; principal: number },
): PeriodStatement {
  const ops = summarizeOperations(transactions);
  const recordedLoanPayments = transactions
    .filter((t) => t.kind === 'expense' && expenseGroupOf[t.category] === 'financing')
    .reduce((sum, t) => sum + t.amount, 0);
  const debtService = debt.interest + debt.principal;
  return {
    period,
    future: false,
    rentalIncome: ops.rentalIncome,
    otherIncome: ops.otherIncome,
    grossIncome: ops.grossIncome,
    operatingExpenses: ops.operatingExpenses,
    noi: ops.noi,
    capex: ops.capex,
    interest: debt.interest,
    principal: debt.principal,
    debtService,
    recordedLoanPayments,
    cashFlow: ops.noi - ops.capex - debtService,
  };
}

/**
 * Twelve monthly statements for `year` plus the annual total. Pass pre-filtered data for one
 * property. With `asOf`, scheduled loan payments after that date are left out, so the current
 * year shows actual figures to date instead of mixing in payments that have not happened.
 */
export function yearStatements({
  transactions,
  loans,
  year,
  asOf,
}: {
  transactions: readonly TransactionInput[];
  loans: readonly LoanInput[];
  year: number;
  /** ISO date; defaults to no cut-off. */
  asOf?: string;
}): { months: PeriodStatement[]; total: PeriodStatement } {
  const schedules = loans.map((loan) => amortizationSchedule(loan));
  const cutOff = (to: string) => (asOf !== undefined && asOf < to ? asOf : to);
  const debtBetween = (from: string, to: string) =>
    schedules.reduce(
      (sum, schedule) => {
        const paid = paymentsBetween(schedule, from, cutOff(to));
        return {
          interest: sum.interest + paid.interest,
          principal: sum.principal + paid.principal,
        };
      },
      { interest: 0, principal: 0 },
    );

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const from = `${month}-01`;
    const to = dayBefore(new Date(fromIsoDate(from).getFullYear(), index + 1, 1));
    return {
      ...statement(
        month,
        transactions.filter((t) => t.date >= from && t.date <= to),
        debtBetween(from, to),
      ),
      future: asOf !== undefined && from > asOf,
    };
  });

  const yearTx = transactions.filter((t) => t.date.startsWith(`${year}-`));
  const total = statement(String(year), yearTx, debtBetween(`${year}-01-01`, `${year}-12-31`));
  return { months, total };
}

/** Totals per category, e.g. for an expense breakdown. */
export function totalsByCategory(transactions: readonly TransactionInput[]) {
  const income = new Map<IncomeCategory, number>();
  const expenses = new Map<ExpenseCategory, number>();
  for (const t of transactions) {
    if (t.kind === 'income') income.set(t.category, (income.get(t.category) ?? 0) + t.amount);
    else expenses.set(t.category, (expenses.get(t.category) ?? 0) + t.amount);
  }
  return { income, expenses };
}
