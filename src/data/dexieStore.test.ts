import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { todayIso } from '@/domain/dates';
import type { PropertyInput } from '@/domain/types';
import { EstatePilotDB } from './db';
import { createDexieStore } from './dexieStore';
import { StoreError, type DataStore } from './store';

const property: PropertyInput = {
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

let db: EstatePilotDB;
let store: DataStore;

beforeEach(async () => {
  db = new EstatePilotDB(`test-${crypto.randomUUID()}`);
  store = createDexieStore(db);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('DexieStore', () => {
  it('seeds demo data when the database is created', async () => {
    const counts = await store.counts();
    expect(counts.properties).toBe(4);
    expect(counts.transactions).toBeGreaterThan(100);
  });

  it('creates, updates and reads a record with metadata', async () => {
    await store.clearAll();
    const created = await store.properties.create(property);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBe(created.updatedAt);

    const updated = await store.properties.update(created.id, { marketValue: 120_000 });
    expect(updated.marketValue).toBe(120_000);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(await store.properties.get(created.id)).toEqual(updated);
  });

  it('rejects invalid input', async () => {
    await expect(store.properties.create({ ...property, purchasePrice: -1 })).rejects.toThrow();
    await expect(
      store.properties.create({ ...property, purchaseDate: '28.10.2026' }),
    ).rejects.toThrow();
  });

  it('fails to update a missing record', async () => {
    await expect(store.properties.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
      StoreError,
    );
  });

  it('removes everything belonging to a deleted property', async () => {
    const [target] = await store.properties.list();
    if (!target) throw new Error('demo data missing');
    const unitIds = (await store.units.listByProperty(target.id)).map((u) => u.id);
    expect(unitIds.length).toBeGreaterThan(0);

    await store.properties.remove(target.id);

    expect(await store.units.listByProperty(target.id)).toEqual([]);
    expect(await store.loans.listByProperty(target.id)).toEqual([]);
    expect((await store.leases.list()).some((l) => unitIds.includes(l.unitId))).toBe(false);
    expect(
      await store.transactions.listInRange({ from: '2000-01-01', to: '2100-01-01' }, target.id),
    ).toEqual([]);
  });

  it('rejects overlapping leases on the same unit', async () => {
    const [existing] = await store.leases.list();
    if (!existing) throw new Error('demo data missing');
    const overlapping = {
      unitId: existing.unitId,
      tenantId: existing.tenantId,
      startDate: existing.startDate,
      endDate: null,
      monthlyRent: 500,
      deposit: 0,
      paymentDay: 1,
      annualIndexation: null,
    };
    await expect(store.leases.create(overlapping)).rejects.toMatchObject({ code: 'leaseOverlap' });
    // Editing a lease does not conflict with itself.
    await expect(store.leases.update(existing.id, { monthlyRent: 999 })).resolves.toMatchObject({
      monthlyRent: 999,
    });
  });

  it('allows a new lease after the previous one ends', async () => {
    const leases = await store.leases.list();
    const ended = leases.find((l) => l.endDate !== null && l.endDate < todayIso());
    if (!ended?.endDate) throw new Error('demo data has no ended lease');
    const others = leases.filter((l) => l.unitId === ended.unitId && l.id !== ended.id);
    expect(others).toEqual([]);
    const created = await store.leases.create({
      unitId: ended.unitId,
      tenantId: ended.tenantId,
      startDate: '2099-01-01',
      endDate: null,
      monthlyRent: 600,
      deposit: 600,
      paymentDay: 5,
      annualIndexation: 0,
    });
    expect(created.annualIndexation).toBe(0);
  });

  it('keeps tenants that have leases', async () => {
    const [lease] = await store.leases.list();
    if (!lease) throw new Error('demo data missing');
    await expect(store.tenants.remove(lease.tenantId)).rejects.toMatchObject({
      code: 'tenantHasLeases',
    });
  });

  it('filters transactions by date range', async () => {
    const all = await store.transactions.list();
    const first = all.map((t) => t.date).sort()[0];
    if (!first) throw new Error('demo data missing');
    const inFirstDay = await store.transactions.listInRange({ from: first, to: first });
    expect(inFirstDay.length).toBe(all.filter((t) => t.date === first).length);
  });
});
