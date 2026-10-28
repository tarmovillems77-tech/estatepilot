import { beforeAll, describe, expect, it } from 'vitest';
import type { PropertyInput } from '@/domain/types';
import { installEstonianErrors } from '@/i18n/validation';
import {
  emptyPropertyForm,
  emptyUnitForm,
  toPropertyForm,
  toUnitForm,
  validatePropertyForm,
  validateUnitForm,
} from './propertyForm';

beforeAll(installEstonianErrors);

const property: PropertyInput = {
  name: 'Pärna 14 korterid',
  type: 'residential',
  status: 'owned',
  address: 'Pärna tn 14',
  city: 'Tallinn',
  purchasePrice: 480_000,
  acquisitionCosts: 9_600,
  purchaseDate: '2021-06-01',
  marketValue: 565_000,
  marketValueDate: '2026-08-01',
  totalArea: 194,
  yearBuilt: 1936,
  rentIndexation: 0.025,
  notes: 'Renoveeritud',
};

describe('property form', () => {
  it('round-trips a stored property', () => {
    const result = validatePropertyForm(toPropertyForm(property));
    expect(result).toEqual({ ok: true, value: property });
  });

  it('shows numbers with a decimal comma and indexation in percent', () => {
    const form = toPropertyForm({ ...property, acquisitionCosts: 9_600.5 });
    expect(form.acquisitionCosts).toBe('9600,5');
    expect(form.rentIndexation).toBe('2,5');
  });

  it('accepts Estonian number formats', () => {
    const result = validatePropertyForm({
      ...toPropertyForm(property),
      purchasePrice: '480 000',
      marketValue: '565 000,00',
    });
    expect(result.ok && result.value.purchasePrice).toBe(480_000);
  });

  it('distinguishes 0% indexation from an empty field', () => {
    const zero = validatePropertyForm({ ...toPropertyForm(property), rentIndexation: '0' });
    const empty = validatePropertyForm({ ...toPropertyForm(property), rentIndexation: '' });
    expect(zero.ok && zero.value.rentIndexation).toBe(0);
    expect(empty.ok && empty.value.rentIndexation).toBeNull();
  });

  it('allows a prospect without purchase date or acquisition costs', () => {
    const result = validatePropertyForm({
      ...emptyPropertyForm('2026-10-28'),
      name: 'Kesk 3',
      status: 'prospect',
      address: 'Kesk tn 3',
      city: 'Pärnu',
      purchasePrice: '395000',
      marketValue: '395000',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.purchaseDate).toBeNull();
    expect(result.value.acquisitionCosts).toBe(0);
  });

  it('reports missing and invalid fields in Estonian', () => {
    const result = validatePropertyForm({
      ...emptyPropertyForm('2026-10-28'),
      purchasePrice: 'palju',
      rentIndexation: '150',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toMatchObject({
      name: 'Kohustuslik väli',
      address: 'Kohustuslik väli',
      purchasePrice: 'Sisesta arv',
      marketValue: 'Kohustuslik väli',
      rentIndexation: 'Sisesta protsent vahemikus 0–100',
    });
  });
});

describe('unit form', () => {
  it('round-trips a unit', () => {
    const unit = {
      propertyId: 'p1',
      name: 'Korter 3',
      type: 'apartment' as const,
      area: 66.5,
      rooms: 3,
      floor: 2,
      marketRent: 980,
    };
    expect(validateUnitForm(toUnitForm(unit), 'p1')).toEqual({ ok: true, value: unit });
  });

  it('defaults the unit type from the property type', () => {
    expect(emptyUnitForm('residential').type).toBe('apartment');
    expect(emptyUnitForm('commercial').type).toBe('office');
  });

  it('requires a positive area and whole room count', () => {
    const result = validateUnitForm(
      { ...emptyUnitForm('residential'), name: 'X', area: '0', rooms: '2,5', marketRent: '500' },
      'p1',
    );
    expect(result.ok ? null : result.errors).toEqual({
      area: 'Väärtus peab olema suurem kui 0',
      rooms: 'Sisesta täisarv',
    });
  });
});
