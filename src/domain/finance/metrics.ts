import { expenseGroupOf, rentCategories } from '../categories';
import type { LoanInput, PropertyInput, TransactionInput } from '../types';
import { amortizationSchedule, balanceOn, paymentsBetween } from './loan';

/*
 * Definitions (all amounts EUR excl. VAT, before income tax):
 *
 *   Gross income         = all income (rent, parking, service charges, other)
 *   Operating expenses   = expenses in the "operating" group (categories.ts); capital
 *                          expenditure and loan payments are excluded
 *   NOI                  = gross income − operating expenses
 *   Debt service         = loan principal + interest paid
 *   Free cash flow (FCF) = NOI − debt service − capital expenditure
 *   Gross yield          = annual rental income / purchase price
 *   Net yield            = NOI / (purchase price + acquisition costs)
 *   Net yield on value   = NOI / current market value
 *   DSCR                 = NOI / debt service
 *   LTV                  = outstanding loan balance / market value
 *   Equity               = market value − outstanding loan balance
 *
 * Ratios return null when the denominator is zero (e.g. DSCR without debt).
 */

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

export const grossYield = (annualRentalIncome: number, purchasePrice: number) =>
  ratio(annualRentalIncome, purchasePrice);
export const netYield = (annualNoi: number, totalInvestment: number) =>
  ratio(annualNoi, totalInvestment);
export const dscr = (noi: number, debtService: number) => ratio(noi, debtService);
export const ltv = (loanBalance: number, marketValue: number) => ratio(loanBalance, marketValue);
export const freeCashFlow = (noi: number, debtService: number, capex: number) =>
  noi - debtService - capex;

export interface OperatingSummary {
  /** Rent and parking. */
  rentalIncome: number;
  /** Service charges and other income. */
  otherIncome: number;
  grossIncome: number;
  operatingExpenses: number;
  capex: number;
  noi: number;
}

export function summarizeOperations(transactions: readonly TransactionInput[]): OperatingSummary {
  let rentalIncome = 0;
  let otherIncome = 0;
  let operatingExpenses = 0;
  let capex = 0;

  for (const t of transactions) {
    if (t.kind === 'income') {
      if (rentCategories.has(t.category)) rentalIncome += t.amount;
      else otherIncome += t.amount;
      continue;
    }
    const group = expenseGroupOf[t.category];
    if (group === 'operating') operatingExpenses += t.amount;
    else if (group === 'capital') capex += t.amount;
    // Recorded loan payments (financing) are skipped: debt service comes from the loan schedule.
  }

  const grossIncome = rentalIncome + otherIncome;
  return {
    rentalIncome,
    otherIncome,
    grossIncome,
    operatingExpenses,
    capex,
    noi: grossIncome - operatingExpenses,
  };
}

export interface Performance extends OperatingSummary {
  months: number;
  debtService: number;
  interest: number;
  principalRepaid: number;
  freeCashFlow: number;
  monthlyNoi: number;
  monthlyFreeCashFlow: number;
  loanBalance: number;
  /** Market value − loan balance. */
  equity: number;
  marketValue: number;
  purchasePrice: number;
  totalInvestment: number;
  grossYield: number | null;
  netYield: number | null;
  netYieldOnValue: number | null;
  dscr: number | null;
  ltv: number | null;
}

export interface PerformanceInput {
  property: Pick<PropertyInput, 'purchasePrice' | 'acquisitionCosts' | 'marketValue'>;
  /** Transactions of this property within the period. */
  transactions: readonly TransactionInput[];
  loans: readonly LoanInput[];
  /** Inclusive ISO range; should span whole months. */
  period: { from: string; to: string };
  months?: number;
  /** Date of the loan balance (and so LTV); defaults to the end of the period. */
  balanceDate?: string;
}

/** Actual performance over a period (normally the trailing 12 months). Yields are annualised. */
export function propertyPerformance({
  property,
  transactions,
  loans,
  period,
  months = 12,
  balanceDate = period.to,
}: PerformanceInput): Performance {
  const summary = summarizeOperations(transactions);

  let debtService = 0;
  let interest = 0;
  let principalRepaid = 0;
  let loanBalance = 0;
  for (const loan of loans) {
    const schedule = amortizationSchedule(loan);
    const paid = paymentsBetween(schedule, period.from, period.to);
    debtService += paid.payment;
    interest += paid.interest;
    principalRepaid += paid.principal;
    loanBalance += balanceOn(loan, schedule, balanceDate);
  }

  return withRatios({
    ...summary,
    months,
    debtService,
    interest,
    principalRepaid,
    loanBalance,
    marketValue: property.marketValue,
    purchasePrice: property.purchasePrice,
    totalInvestment: property.purchasePrice + property.acquisitionCosts,
  });
}

type PerformanceTotals = Omit<
  Performance,
  | 'freeCashFlow'
  | 'monthlyNoi'
  | 'monthlyFreeCashFlow'
  | 'grossYield'
  | 'netYield'
  | 'netYieldOnValue'
  | 'dscr'
  | 'ltv'
  | 'equity'
>;

function withRatios(totals: PerformanceTotals): Performance {
  const annualise = 12 / totals.months;
  const fcf = freeCashFlow(totals.noi, totals.debtService, totals.capex);
  return {
    ...totals,
    freeCashFlow: fcf,
    monthlyNoi: totals.noi / totals.months,
    monthlyFreeCashFlow: fcf / totals.months,
    grossYield: grossYield(totals.rentalIncome * annualise, totals.purchasePrice),
    netYield: netYield(totals.noi * annualise, totals.totalInvestment),
    netYieldOnValue: netYield(totals.noi * annualise, totals.marketValue),
    dscr: dscr(totals.noi, totals.debtService),
    ltv: ltv(totals.loanBalance, totals.marketValue),
    equity: totals.marketValue - totals.loanBalance,
  };
}

const summed = [
  'rentalIncome',
  'otherIncome',
  'grossIncome',
  'operatingExpenses',
  'capex',
  'noi',
  'debtService',
  'interest',
  'principalRepaid',
  'loanBalance',
  'marketValue',
  'purchasePrice',
  'totalInvestment',
] as const;

/** Portfolio totals; ratios are recomputed from the sums, not averaged. */
export function combinePerformance(items: readonly Performance[]): Performance {
  const totals = Object.fromEntries(
    summed.map((key) => [key, items.reduce((sum, item) => sum + item[key], 0)]),
  ) as Record<(typeof summed)[number], number>;
  return withRatios({ ...totals, months: items[0]?.months ?? 12 });
}
