import type { Table } from 'dexie';
import type { z } from 'zod';
import {
  leaseSchema,
  loanSchema,
  propertySchema,
  scenarioSetSchema,
  tenantSchema,
  transactionSchema,
  unitSchema,
} from '@/domain/schemas';
import { leasesOverlap } from '@/domain/leases';
import type { LeaseInput, WithMeta } from '@/domain/types';
import type { EstatePilotDB } from './db';
import { newMeta } from './meta';
import { StoreError, type DataSnapshot, type DataStore, type Repository } from './store';

function createRepository<TInput extends object>(
  table: Table<WithMeta<TInput>, string>,
  schema: z.ZodType<TInput>,
  remove: (id: string) => Promise<void> = (id) => table.delete(id),
): Repository<TInput> {
  return {
    list: () => table.toArray(),
    get: (id) => table.get(id),
    async create(input) {
      const entity: WithMeta<TInput> = { ...schema.parse(input), ...newMeta() };
      await table.add(entity);
      return entity;
    },
    async update(id, changes) {
      const existing = await table.get(id);
      if (!existing) throw new StoreError('notFound');
      // parse() drops id/timestamps from the merged record; they are re-added below.
      const entity: WithMeta<TInput> = {
        ...schema.parse({ ...existing, ...changes }),
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await table.put(entity);
      return entity;
    },
    remove,
  };
}

export function createDexieStore(db: EstatePilotDB): DataStore {
  const allTables = [
    db.properties,
    db.units,
    db.tenants,
    db.leases,
    db.transactions,
    db.loans,
    db.scenarioSets,
  ];

  // Deleting a property removes everything that belongs to it.
  const removeProperty = (id: string) =>
    db.transaction('rw', allTables, async () => {
      const unitIds = await db.units.where('propertyId').equals(id).primaryKeys();
      await db.leases.where('unitId').anyOf(unitIds).delete();
      await db.units.bulkDelete(unitIds);
      await db.transactions.where('propertyId').equals(id).delete();
      await db.loans.where('propertyId').equals(id).delete();
      await db.properties.delete(id);
    });

  // Deleting a unit removes its leases; its transactions stay on the property.
  const removeUnit = (id: string) =>
    db.transaction('rw', [db.units, db.leases, db.transactions], async () => {
      await db.leases.where('unitId').equals(id).delete();
      await db.transactions.where('unitId').equals(id).modify({ unitId: null });
      await db.units.delete(id);
    });

  // Tenants with lease history are kept so that history stays intact.
  const leaseRepository = createRepository(db.leases, leaseSchema);

  async function assertNoOverlap(
    lease: Pick<LeaseInput, 'unitId' | 'startDate' | 'endDate'>,
    ignoreId?: string,
  ) {
    const others = await db.leases.where('unitId').equals(lease.unitId).toArray();
    if (others.some((other) => other.id !== ignoreId && leasesOverlap(other, lease))) {
      throw new StoreError('leaseOverlap');
    }
  }

  const removeTenant = (id: string) =>
    db.transaction('rw', [db.tenants, db.leases], async () => {
      if ((await db.leases.where('tenantId').equals(id).count()) > 0) {
        throw new StoreError('tenantHasLeases');
      }
      await db.tenants.delete(id);
    });

  return {
    properties: createRepository(db.properties, propertySchema, removeProperty),
    units: {
      ...createRepository(db.units, unitSchema, removeUnit),
      listByProperty: (propertyId) => db.units.where('propertyId').equals(propertyId).toArray(),
    },
    tenants: createRepository(db.tenants, tenantSchema, removeTenant),
    leases: {
      ...leaseRepository,
      // A unit can only have one lease on any given day.
      async create(input) {
        await assertNoOverlap(input);
        return leaseRepository.create(input);
      },
      async update(id, changes) {
        const existing = await db.leases.get(id);
        if (!existing) throw new StoreError('notFound');
        await assertNoOverlap({ ...existing, ...changes }, id);
        return leaseRepository.update(id, changes);
      },
      listByUnit: (unitId) => db.leases.where('unitId').equals(unitId).toArray(),
    },
    transactions: {
      ...createRepository(db.transactions, transactionSchema),
      listInRange: ({ from, to }, propertyId) =>
        propertyId === undefined
          ? db.transactions.where('date').between(from, to, true, true).sortBy('date')
          : db.transactions
              .where('[propertyId+date]')
              .between([propertyId, from], [propertyId, to], true, true)
              .toArray(),
    },
    scenarioSets: createRepository(db.scenarioSets, scenarioSetSchema),
    loans: {
      ...createRepository(db.loans, loanSchema),
      listByProperty: (propertyId) => db.loans.where('propertyId').equals(propertyId).toArray(),
    },
    async counts() {
      const [properties, units, tenants, leases, transactions, loans, scenarioSets] =
        await Promise.all(allTables.map((table) => table.count()));
      return {
        properties: properties ?? 0,
        units: units ?? 0,
        tenants: tenants ?? 0,
        leases: leases ?? 0,
        transactions: transactions ?? 0,
        loans: loans ?? 0,
        scenarioSets: scenarioSets ?? 0,
      };
    },
    replaceAll: (snapshot: DataSnapshot) =>
      db.transaction('rw', allTables, async () => {
        await Promise.all(allTables.map((table) => table.clear()));
        await Promise.all([
          db.properties.bulkAdd(snapshot.properties),
          db.units.bulkAdd(snapshot.units),
          db.tenants.bulkAdd(snapshot.tenants),
          db.leases.bulkAdd(snapshot.leases),
          db.transactions.bulkAdd(snapshot.transactions),
          db.loans.bulkAdd(snapshot.loans),
          db.scenarioSets.bulkAdd(snapshot.scenarioSets),
        ]);
      }),
    clearAll: () =>
      db.transaction('rw', allTables, async () => {
        await Promise.all(allTables.map((table) => table.clear()));
      }),
  };
}
