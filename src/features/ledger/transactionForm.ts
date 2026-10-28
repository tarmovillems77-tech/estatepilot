import { transactionSchema } from '@/domain/schemas';
import type { TransactionInput } from '@/domain/types';
import { parseNumberInput, toNumberInput } from '@/i18n/parse';
import { validateForm } from '@/i18n/validation';

/* Text-based form values for transactions; see properties/propertyForm.ts. */

const optionalText = (text: string) => (text.trim() === '' ? undefined : text.trim());

export interface TransactionFormValues {
  kind: TransactionInput['kind'];
  date: string;
  propertyId: string;
  /** '' = whole property */
  unitId: string;
  /** '' = not linked to a lease */
  leaseId: string;
  /** "YYYY-MM" or '' */
  periodMonth: string;
  category: string;
  amount: string;
  description: string;
  counterparty: string;
  externalRef: string;
}

export type TransactionField = keyof TransactionFormValues;

export const defaultCategory: Record<TransactionInput['kind'], TransactionInput['category']> = {
  income: 'rent',
  expense: 'management',
};

export function emptyTransactionForm(today: string, propertyId = ''): TransactionFormValues {
  return {
    kind: 'expense',
    date: today,
    propertyId,
    unitId: '',
    leaseId: '',
    periodMonth: '',
    category: defaultCategory.expense,
    amount: '',
    description: '',
    counterparty: '',
    externalRef: '',
  };
}

export function toTransactionForm(t: TransactionInput): TransactionFormValues {
  return {
    kind: t.kind,
    date: t.date,
    propertyId: t.propertyId,
    unitId: t.unitId ?? '',
    leaseId: t.leaseId ?? '',
    periodMonth: t.periodMonth ?? '',
    category: t.category,
    amount: toNumberInput(t.amount),
    description: t.description ?? '',
    counterparty: t.counterparty ?? '',
    externalRef: t.externalRef ?? '',
  };
}

/** `source` is kept from the stored record when editing (imported rows stay "import"). */
export function validateTransactionForm(
  values: TransactionFormValues,
  source: TransactionInput['source'] = 'manual',
) {
  return validateForm<TransactionInput, TransactionField>(transactionSchema, {
    kind: values.kind,
    category: values.category,
    date: values.date,
    propertyId: values.propertyId,
    unitId: values.unitId === '' ? null : values.unitId,
    // Only income can settle rent.
    leaseId: values.kind === 'income' && values.leaseId !== '' ? values.leaseId : null,
    periodMonth:
      values.kind === 'income' && values.leaseId !== ''
        ? optionalText(values.periodMonth)
        : undefined,
    amount: parseNumberInput(values.amount),
    description: optionalText(values.description),
    counterparty: optionalText(values.counterparty),
    externalRef: optionalText(values.externalRef),
    source,
  });
}
