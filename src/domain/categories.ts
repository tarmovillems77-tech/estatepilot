export const incomeCategories = ['rent', 'parking', 'service_charges', 'other_income'] as const;

export const expenseCategories = [
  'management',
  'maintenance',
  'repairs',
  'utilities',
  'insurance',
  'land_tax',
  'other_expense',
  'capex',
  'loan_payment',
] as const;

export type IncomeCategory = (typeof incomeCategories)[number];
export type ExpenseCategory = (typeof expenseCategories)[number];
export type TransactionCategory = IncomeCategory | ExpenseCategory;

/**
 * How an expense is treated in the calculations:
 * - operating: part of operating expenses, reduces NOI
 * - capital:   capital expenditure (renovations, replacements); after NOI, reduces cash flow
 * - financing: loan payments; after NOI. Calculations use the loan schedule for debt service
 *              (it splits interest and principal), so recorded loan payments are shown for
 *              reconciliation only and never counted twice.
 */
export type ExpenseGroup = 'operating' | 'capital' | 'financing';

export const expenseGroupOf: Record<ExpenseCategory, ExpenseGroup> = {
  management: 'operating',
  maintenance: 'operating',
  repairs: 'operating',
  utilities: 'operating',
  insurance: 'operating',
  land_tax: 'operating',
  other_expense: 'operating',
  capex: 'capital',
  loan_payment: 'financing',
};

export const expenseGroups: readonly ExpenseGroup[] = ['operating', 'capital', 'financing'];

export function isOperatingExpense(category: ExpenseCategory): boolean {
  return expenseGroupOf[category] === 'operating';
}

/** Income categories that settle the rent due under a lease. */
export const rentCategories: ReadonlySet<IncomeCategory> = new Set(['rent', 'parking']);
