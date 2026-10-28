import { beforeAll, describe, expect, it } from 'vitest';
import type { LeaseInput } from '@/domain/types';
import { installEstonianErrors } from '@/i18n/validation';
import {
  emptyLeaseForm,
  emptyTenantForm,
  toLeaseForm,
  validateLeaseForm,
  validateTenantForm,
} from './leaseForm';

beforeAll(installEstonianErrors);

const lease: LeaseInput = {
  unitId: 'u1',
  tenantId: 't1',
  startDate: '2026-01-01',
  endDate: '2027-12-31',
  monthlyRent: 780,
  deposit: 1_560,
  paymentDay: 5,
  annualIndexation: 0.025,
  notes: 'Lemmikloomad lubatud',
};

describe('lease form', () => {
  it('round-trips a stored lease', () => {
    expect(validateLeaseForm(toLeaseForm(lease))).toEqual({ ok: true, value: lease });
  });

  it('treats an empty end date as open-ended and an empty deposit as 0', () => {
    const result = validateLeaseForm({ ...toLeaseForm(lease), endDate: '', deposit: '' });
    expect(result.ok && result.value.endDate).toBeNull();
    expect(result.ok && result.value.deposit).toBe(0);
  });

  it('distinguishes 0% indexation from inheriting the property default', () => {
    const zero = validateLeaseForm({ ...toLeaseForm(lease), annualIndexation: '0' });
    const inherit = validateLeaseForm({ ...toLeaseForm(lease), annualIndexation: '' });
    expect(zero.ok && zero.value.annualIndexation).toBe(0);
    expect(inherit.ok && inherit.value.annualIndexation).toBeNull();
  });

  it('reports Estonian errors for a blank form and an end before the start', () => {
    const blank = validateLeaseForm({ ...emptyLeaseForm('2026-10-28'), paymentDay: '31' });
    expect(blank.ok ? null : blank.errors).toMatchObject({
      unitId: 'Kohustuslik väli',
      tenantId: 'Kohustuslik väli',
      monthlyRent: 'Kohustuslik väli',
      paymentDay: 'Väärtus võib olla kuni 28',
    });

    const reversed = validateLeaseForm({ ...toLeaseForm(lease), endDate: '2025-12-31' });
    expect(reversed.ok ? null : reversed.errors.endDate).toBe(
      'Lõppkuupäev ei saa olla enne alguskuupäeva',
    );
  });
});

describe('tenant form', () => {
  it('drops the registry code for private persons', () => {
    const result = validateTenantForm({
      ...emptyTenantForm(),
      name: 'Mari Maasikas',
      registryCode: '12345678',
    });
    expect(result.ok && result.value.registryCode).toBeUndefined();
  });

  it('keeps the registry code for companies and validates e-mail', () => {
    const result = validateTenantForm({
      ...emptyTenantForm(),
      kind: 'company',
      name: 'Näidis OÜ',
      registryCode: '12345678',
      email: 'vigane',
    });
    expect(result.ok ? null : result.errors).toEqual({
      email: 'Sisesta korrektne e-posti aadress',
    });
  });
});
