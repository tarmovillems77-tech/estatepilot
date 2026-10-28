import { describe, expect, it } from 'vitest';
import type { Lease, Property, Tenant, TransactionInput, Unit } from '@/domain/types';
import {
  csvField,
  findDuplicates,
  transactionCsvTemplate,
  transactionFingerprint,
  transactionsToCsv,
} from './transactionsCsv';

const meta = { createdAt: '', updatedAt: '' };
const lookups = {
  properties: [{ ...meta, id: 'p1', name: 'Pärna 14 korterid' } as Property],
  units: [{ ...meta, id: 'u1', name: 'Korter 1' } as Unit],
  leases: [{ ...meta, id: 'l1', tenantId: 't1' } as Lease],
  tenants: [{ ...meta, id: 't1', name: 'Kati Karu' } as Tenant],
};

const rent: TransactionInput = {
  kind: 'income',
  category: 'rent',
  propertyId: 'p1',
  unitId: 'u1',
  leaseId: 'l1',
  date: '2026-03-05',
  periodMonth: '2026-03',
  amount: 740,
  description: 'Üür; märts',
  counterparty: 'Kati Karu',
  externalRef: 'ARH-001',
  source: 'manual',
};
const repair: TransactionInput = {
  kind: 'expense',
  category: 'repairs',
  propertyId: 'p1',
  unitId: null,
  leaseId: null,
  date: '2026-03-20',
  amount: 1234.5,
  source: 'manual',
};

const lines = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n');

describe('transactionsToCsv', () => {
  const csv = transactionsToCsv([rent, repair], lookups);

  it('starts with a BOM and Estonian headings', () => {
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(lines(csv)[0]).toBe(
      'Kuupäev;Tüüp;Kategooria;Objekt;Üksus;Üürnik;Periood;Summa;Kirjeldus;Vastaspool;Viide',
    );
  });

  it('writes Estonian dates, signed amounts with decimal comma and quotes separators', () => {
    expect(lines(csv)[1]).toBe(
      '05.03.2026;Tulu;Üür;Pärna 14 korterid;Korter 1;Kati Karu;03.2026;740,00;"Üür; märts";Kati Karu;ARH-001',
    );
    expect(lines(csv)[2]).toBe('20.03.2026;Kulu;Remont;Pärna 14 korterid;;;;-1234,50;;;');
  });
});

describe('csvField', () => {
  it('quotes fields with quotes or separators and doubles inner quotes (RFC 4180)', () => {
    expect(csvField('tavaline')).toBe('tavaline');
    expect(csvField('Ütles "tere"')).toBe('"Ütles ""tere"""');
    expect(csvField('a;"b"')).toBe('"a;""b"""');
  });
});

describe('transactionCsvTemplate', () => {
  it('has headings and two example rows with the same number of columns', () => {
    const rows = lines(transactionCsvTemplate());
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.split(';').length))).toEqual(new Set([11]));
  });
});

describe('duplicate detection', () => {
  it('prefers the bank reference and falls back to date, amount and counterparty', () => {
    expect(transactionFingerprint(rent)).toBe('ref:arh-001');
    expect(transactionFingerprint({ ...repair, counterparty: '  Näidis  Remont OÜ ' })).toBe(
      '2026-03-20|-1234,50|näidis remont oü',
    );
  });

  it('finds rows that were already imported', () => {
    const again = { ...rent, description: 'muudetud kirjeldus' };
    const fresh = { ...rent, externalRef: 'ARH-002' };
    expect(findDuplicates([rent, repair], [again, fresh])).toEqual([again]);
  });
});
