import { beforeAll, describe, expect, it } from 'vitest';
import type { LoanInput } from '@/domain/types';
import { installEstonianErrors } from '@/i18n/validation';
import { CUSTOM_TERM, emptyLoanForm, PORTFOLIO, toLoanForm, validateLoanForm } from './loanForm';

beforeAll(installEstonianErrors);

const loan: LoanInput = {
  propertyId: 'p1',
  lender: 'Näidispank AS',
  reference: 'NP-1',
  principal: 336_000,
  startDate: '2021-06-01',
  termMonths: 300,
  repaymentType: 'annuity',
  rateType: 'euribor',
  euriborTenor: '6M',
  euribor: 0.022,
  margin: 0.0185,
  dayCount: 'act/360',
  actualBalance: { amount: 289_500, date: '2026-10-01' },
  notes: 'Hüpoteek',
};

describe('loan form', () => {
  it('round-trips a variable-rate loan with an actual balance', () => {
    const form = toLoanForm(loan);
    expect(form).toMatchObject({ termPreset: '300', euribor: '2,2', margin: '1,85' });
    expect(validateLoanForm(form)).toEqual({ ok: true, value: loan });
  });

  it('supports portfolio-level loans and custom terms', () => {
    const result = validateLoanForm({
      ...toLoanForm(loan),
      propertyId: PORTFOLIO,
      termPreset: CUSTOM_TERM,
      termMonths: '150',
    });
    expect(result.ok && result.value).toMatchObject({ propertyId: null, termMonths: 150 });
    expect(toLoanForm({ ...loan, propertyId: null, termMonths: 150 })).toMatchObject({
      propertyId: PORTFOLIO,
      termPreset: CUSTOM_TERM,
    });
  });

  it('switches to a fixed rate without Euribor fields', () => {
    const result = validateLoanForm({ ...toLoanForm(loan), rateType: 'fixed', fixedRate: '4,95' });
    expect(result.ok && result.value).toMatchObject({ rateType: 'fixed', fixedRate: 0.0495 });
    expect(result.ok && 'margin' in result.value).toBe(false);
  });

  it('requires both actual balance amount and date', () => {
    const result = validateLoanForm({ ...toLoanForm(loan), actualDate: '' });
    expect(result.ok ? null : result.errors.actualDate).toBe('Sisesta nii summa kui kuupäev.');
  });

  it('reports missing fields in Estonian', () => {
    const result = validateLoanForm(emptyLoanForm('2026-10-29'));
    expect(result.ok ? null : result.errors).toMatchObject({
      lender: 'Kohustuslik väli',
      principal: 'Kohustuslik väli',
      euribor: 'Kohustuslik väli',
      margin: 'Kohustuslik väli',
    });
  });
});
