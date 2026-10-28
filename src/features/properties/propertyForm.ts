import { propertySchema, unitSchema } from '@/domain/schemas';
import type { PropertyInput, UnitInput } from '@/domain/types';
import { parseNumberInput, parsePercentInput, toNumberInput, toPercentInput } from '@/i18n/parse';
import { validateForm } from '@/i18n/validation';

/*
 * Forms keep every value as text so Estonian number formats ("1 234,50") can be typed freely.
 * These adapters convert between stored records and form values; validation uses the domain
 * schemas, so forms, imports and the database share the same rules.
 */

const optionalText = (text: string) => (text.trim() === '' ? undefined : text.trim());

export interface PropertyFormValues {
  name: string;
  type: PropertyInput['type'];
  status: PropertyInput['status'];
  address: string;
  city: string;
  purchasePrice: string;
  acquisitionCosts: string;
  purchaseDate: string;
  marketValue: string;
  marketValueDate: string;
  totalArea: string;
  yearBuilt: string;
  rentIndexation: string;
  notes: string;
}

export type PropertyField = keyof PropertyFormValues;

export function emptyPropertyForm(today: string): PropertyFormValues {
  return {
    name: '',
    type: 'residential',
    status: 'owned',
    address: '',
    city: '',
    purchasePrice: '',
    acquisitionCosts: '',
    purchaseDate: '',
    marketValue: '',
    marketValueDate: today,
    totalArea: '',
    yearBuilt: '',
    rentIndexation: '',
    notes: '',
  };
}

export function toPropertyForm(property: PropertyInput): PropertyFormValues {
  return {
    name: property.name,
    type: property.type,
    status: property.status,
    address: property.address,
    city: property.city,
    purchasePrice: toNumberInput(property.purchasePrice),
    acquisitionCosts: toNumberInput(property.acquisitionCosts),
    purchaseDate: property.purchaseDate ?? '',
    marketValue: toNumberInput(property.marketValue),
    marketValueDate: property.marketValueDate,
    totalArea: toNumberInput(property.totalArea),
    yearBuilt: property.yearBuilt === undefined ? '' : String(property.yearBuilt),
    rentIndexation: toPercentInput(property.rentIndexation),
    notes: property.notes ?? '',
  };
}

export function validatePropertyForm(values: PropertyFormValues) {
  return validateForm<PropertyInput, PropertyField>(
    propertySchema,
    {
      name: values.name,
      type: values.type,
      status: values.status,
      address: values.address,
      city: values.city,
      purchasePrice: parseNumberInput(values.purchasePrice),
      // Acquisition costs default to 0 so the field can be left empty.
      acquisitionCosts: parseNumberInput(values.acquisitionCosts) ?? 0,
      purchaseDate: values.purchaseDate === '' ? null : values.purchaseDate,
      marketValue: parseNumberInput(values.marketValue),
      marketValueDate: values.marketValueDate,
      totalArea: parseNumberInput(values.totalArea),
      yearBuilt: parseNumberInput(values.yearBuilt),
      rentIndexation: parsePercentInput(values.rentIndexation) ?? null,
      notes: optionalText(values.notes),
    },
    ['rentIndexation'],
  );
}

export interface UnitFormValues {
  name: string;
  type: UnitInput['type'];
  area: string;
  rooms: string;
  floor: string;
  marketRent: string;
  notes: string;
}

export type UnitField = keyof UnitFormValues;

export function emptyUnitForm(propertyType: PropertyInput['type']): UnitFormValues {
  return {
    name: '',
    type: propertyType === 'residential' ? 'apartment' : 'office',
    area: '',
    rooms: '',
    floor: '',
    marketRent: '',
    notes: '',
  };
}

export function toUnitForm(unit: UnitInput): UnitFormValues {
  return {
    name: unit.name,
    type: unit.type,
    area: toNumberInput(unit.area),
    rooms: unit.rooms === undefined ? '' : String(unit.rooms),
    floor: unit.floor === undefined ? '' : String(unit.floor),
    marketRent: toNumberInput(unit.marketRent),
    notes: unit.notes ?? '',
  };
}

export function validateUnitForm(values: UnitFormValues, propertyId: string) {
  return validateForm<UnitInput, UnitField>(unitSchema, {
    propertyId,
    name: values.name,
    type: values.type,
    area: parseNumberInput(values.area),
    rooms: parseNumberInput(values.rooms),
    floor: parseNumberInput(values.floor),
    marketRent: parseNumberInput(values.marketRent),
    notes: optionalText(values.notes),
  });
}
