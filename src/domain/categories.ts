export const incomeCategories = ['rent', 'service_charges', 'parking', 'other_income'] as const;

export const expenseCategories = [
  'management',
  'maintenance',
  'utilities',
  'insurance',
  'land_tax',
  'cleaning',
  'marketing',
  'other_expense',
  'capex',
] as const;

export type IncomeCategory = (typeof incomeCategories)[number];
export type ExpenseCategory = (typeof expenseCategories)[number];
export type TransactionCategory = IncomeCategory | ExpenseCategory;

/**
 * Expenses that are not operating costs and therefore stay out of NOI.
 * Capital expenditure is deducted later, in free cash flow.
 */
const nonOperatingExpenses: ReadonlySet<ExpenseCategory> = new Set(['capex']);

export function isOperatingExpense(category: ExpenseCategory): boolean {
  return !nonOperatingExpenses.has(category);
}
