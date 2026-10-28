import Dexie, { type Table } from 'dexie';
import type { Lease, Loan, Property, Tenant, Transaction, Unit } from '@/domain/types';
import { buildDemoData } from './demo';

// Records always carry their id (assigned by the data layer), so plain Table<T, string> suffices.
export class EstatePilotDB extends Dexie {
  properties!: Table<Property, string>;
  units!: Table<Unit, string>;
  tenants!: Table<Tenant, string>;
  leases!: Table<Lease, string>;
  transactions!: Table<Transaction, string>;
  loans!: Table<Loan, string>;

  constructor(name = 'estatepilot') {
    super(name);

    // Only indexed fields are listed; other fields are stored but not queryable by index.
    // Schema changes need a new version(n) block — never edit an existing one.
    this.version(1).stores({
      properties: 'id, status, type',
      units: 'id, propertyId',
      tenants: 'id, name',
      leases: 'id, unitId, tenantId, endDate',
      transactions: 'id, propertyId, unitId, date, [propertyId+date]',
      loans: 'id, propertyId',
    });

    // First launch: start with fictional demo data so the app is not empty.
    this.on('populate', async (tx) => {
      const demo = buildDemoData(new Date());
      await Promise.all([
        tx.table('properties').bulkAdd(demo.properties),
        tx.table('units').bulkAdd(demo.units),
        tx.table('tenants').bulkAdd(demo.tenants),
        tx.table('leases').bulkAdd(demo.leases),
        tx.table('transactions').bulkAdd(demo.transactions),
        tx.table('loans').bulkAdd(demo.loans),
      ]);
    });
  }
}

export const db = new EstatePilotDB();
