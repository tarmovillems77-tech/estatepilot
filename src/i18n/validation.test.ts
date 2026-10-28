import { beforeAll, describe, expect, it } from 'vitest';
import { leaseSchema, propertySchema } from '@/domain/schemas';
import { installEstonianErrors, validateForm } from './validation';

beforeAll(installEstonianErrors);

const property = {
  name: 'Testmaja',
  type: 'residential',
  status: 'owned',
  address: 'Test tn 1',
  city: 'Tallinn',
  purchasePrice: 100_000,
  acquisitionCosts: 2_000,
  purchaseDate: '2024-01-15',
  marketValue: 110_000,
  marketValueDate: '2026-01-01',
  rentIndexation: null,
};

describe('validateForm', () => {
  it('returns the parsed value when valid', () => {
    const result = validateForm(propertySchema, property);
    expect(result.ok).toBe(true);
  });

  it('reports Estonian messages per field', () => {
    const result = validateForm(propertySchema, {
      ...property,
      name: '',
      purchasePrice: Number.NaN,
      acquisitionCosts: -5,
      marketValue: undefined,
      purchaseDate: '15.01.2024',
      yearBuilt: 1990.5,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toMatchObject({
      name: 'Kohustuslik väli',
      purchasePrice: 'Sisesta arv',
      acquisitionCosts: 'Väärtus ei saa olla negatiivne',
      marketValue: 'Kohustuslik väli',
      purchaseDate: 'Sisesta kuupäev',
      yearBuilt: 'Sisesta täisarv',
    });
  });

  it('uses a percent message for percent fields', () => {
    const result = validateForm(propertySchema, { ...property, rentIndexation: 1.5 }, [
      'rentIndexation',
    ]);
    expect(result.ok ? null : result.errors.rentIndexation).toBe(
      'Sisesta protsent vahemikus 0–100',
    );
  });

  it('translates refinement messages', () => {
    const result = validateForm(leaseSchema, {
      unitId: 'u',
      tenantId: 't',
      startDate: '2026-06-01',
      endDate: '2026-01-01',
      monthlyRent: 500,
      deposit: 500,
      paymentDay: 5,
      annualIndexation: null,
    });
    expect(result.ok ? null : result.errors.endDate).toBe(
      'Lõppkuupäev ei saa olla enne alguskuupäeva',
    );
  });
});
