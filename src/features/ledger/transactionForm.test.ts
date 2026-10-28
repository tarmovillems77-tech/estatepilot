import { beforeAll, describe, expect, it } from 'vitest';
import type { TransactionInput } from '@/domain/types';
import { installEstonianErrors } from '@/i18n/validation';
import {
  emptyTransactionForm,
  toTransactionForm,
  validateTransactionForm,
} from './transactionForm';

beforeAll(installEstonianErrors);

const rent: TransactionInput = {
  kind: 'income',
  category: 'rent',
  propertyId: 'p1',
  unitId: 'u1',
  leaseId: 'l1',
  date: '2026-04-02',
  periodMonth: '2026-03',
  amount: 740,
  description: 'Üür – Korter 1',
  counterparty: 'Kati Karu',
  externalRef: 'ARH-1',
  source: 'import',
};

describe('transaction form', () => {
  it('round-trips a rent payment and keeps its source', () => {
    expect(validateTransactionForm(toTransactionForm(rent), rent.source)).toEqual({
      ok: true,
      value: rent,
    });
  });

  it('drops the lease link for expenses', () => {
    const result = validateTransactionForm({
      ...toTransactionForm(rent),
      kind: 'expense',
      category: 'repairs',
    });
    expect(result.ok && result.value).toMatchObject({ leaseId: null, periodMonth: undefined });
  });

  it('rejects an income category on an expense and reports missing fields in Estonian', () => {
    const result = validateTransactionForm({
      ...emptyTransactionForm('2026-10-28'),
      category: 'rent',
      amount: '-5',
    });
    expect(result.ok ? null : result.errors).toMatchObject({
      propertyId: 'Kohustuslik väli',
      amount: 'Väärtus ei saa olla negatiivne',
      category: 'Vali sobiv väärtus',
    });
  });

  it('accepts Estonian amounts', () => {
    const result = validateTransactionForm({
      ...emptyTransactionForm('2026-10-28', 'p1'),
      amount: '1 234,56',
    });
    expect(result.ok && result.value.amount).toBe(1234.56);
  });
});
