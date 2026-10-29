import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { EstatePilotDB } from './db';

/** Creates a database in the version 2 format, as saved by Steps 4–5. */
async function createV2Database(name: string) {
  const old = new Dexie(name);
  old.version(1).stores({
    properties: 'id, status, type',
    units: 'id, propertyId',
    tenants: 'id, name',
    leases: 'id, unitId, tenantId, endDate',
    transactions: 'id, propertyId, unitId, date, [propertyId+date]',
    loans: 'id, propertyId',
  });
  old.version(2).stores({});
  await old.open();
  await old.table('loans').bulkAdd([
    { id: 'loan-v', propertyId: 'p', rateType: 'euribor', margin: 0.02, euribor: 0.02 },
    { id: 'loan-f', propertyId: 'p', rateType: 'fixed', fixedRate: 0.05 },
  ]);
  await old.table('leases').add({
    id: 'lease-1',
    unitId: 'unit-1',
    tenantId: 'tenant-1',
    startDate: '2025-01-01',
    endDate: null,
    monthlyRent: 700,
  });
  const base = { propertyId: 'p', date: '2026-03-05', amount: 100 };
  await old.table('transactions').bulkAdd([
    { ...base, id: 't1', kind: 'expense', category: 'cleaning', unitId: null },
    { ...base, id: 't2', kind: 'expense', category: 'marketing', unitId: null },
    { ...base, id: 't3', kind: 'income', category: 'rent', unitId: 'unit-1', amount: 700 },
    { ...base, id: 't4', kind: 'income', category: 'rent', unitId: 'unit-2', amount: 500 },
  ]);
  old.close();
}

describe('database upgrades', () => {
  it('maps old categories, links rent to leases and adds defaults', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    await createV2Database(name);

    const db = new EstatePilotDB(name);
    await db.open();
    const byId = new Map((await db.transactions.toArray()).map((t) => [t.id, t]));

    expect(byId.get('t1')?.category).toBe('maintenance');
    expect(byId.get('t2')?.category).toBe('other_expense');
    expect(byId.get('t3')?.leaseId).toBe('lease-1');
    expect(byId.get('t4')?.leaseId).toBeNull(); // no lease for that unit
    expect([...byId.values()].every((t) => t.source === 'manual')).toBe(true);
    // Existing databases are upgraded, not re-seeded with demo data.
    expect(await db.properties.count()).toBe(0);
    expect(await db.transactions.where('leaseId').equals('lease-1').count()).toBe(1);

    // v4: loans keep the 3-month reset they were calculated with and get the new defaults.
    const loans = new Map((await db.loans.toArray()).map((l) => [l.id, l]));
    expect(loans.get('loan-v')).toMatchObject({
      euriborTenor: '3M',
      dayCount: '30/360',
      actualBalance: null,
    });
    expect(loans.get('loan-f')).toMatchObject({ dayCount: '30/360', actualBalance: null });
    expect(loans.get('loan-f')).not.toHaveProperty('euriborTenor');

    await db.delete();
  });

  it('keeps all Step 8 (version 4) data when adding scenario sets', async () => {
    const name = `migration-v4-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    const stores = {
      properties: 'id, status, type',
      units: 'id, propertyId',
      tenants: 'id, name',
      leases: 'id, unitId, tenantId, endDate',
      transactions: 'id, propertyId, unitId, date, [propertyId+date]',
      loans: 'id, propertyId',
    };
    old.version(1).stores(stores);
    old.version(2).stores({});
    old
      .version(3)
      .stores({ transactions: 'id, propertyId, unitId, leaseId, date, [propertyId+date]' });
    old.version(4).stores({});
    await old.open();
    const property = {
      id: 'p1',
      name: 'Minu maja',
      status: 'owned',
      type: 'residential',
      rentIndexation: 0.02,
    };
    const loan = {
      id: 'l1',
      propertyId: null,
      rateType: 'fixed',
      fixedRate: 0.04,
      dayCount: 'act/360',
      actualBalance: { amount: 50_000, date: '2026-10-01' },
    };
    await old.table('properties').add(property);
    await old.table('loans').add(loan);
    await old.table('transactions').add({
      id: 't1',
      propertyId: 'p1',
      leaseId: null,
      date: '2026-05-01',
      amount: 10,
      kind: 'expense',
      category: 'repairs',
      source: 'manual',
    });
    old.close();

    const db = new EstatePilotDB(name);
    await db.open();
    expect(await db.properties.toArray()).toEqual([property]);
    expect(await db.loans.toArray()).toEqual([loan]);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.units.count()).toBe(0); // not re-seeded with demo data
    expect(await db.scenarioSets.count()).toBe(0);
    await db.delete();
  });
});
