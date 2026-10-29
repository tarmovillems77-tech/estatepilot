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

    // v2: properties get a default rent indexation (null = follow the forecast scenario).
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('properties')
          .toCollection()
          .modify((property: { rentIndexation?: number | null }) => {
            property.rentIndexation ??= null;
          }),
      );

    // v3: rent payments link to leases; expense categories reorganised (Step 6).
    this.version(3)
      .stores({ transactions: 'id, propertyId, unitId, leaseId, date, [propertyId+date]' })
      .upgrade(async (tx) => {
        const leases = (await tx.table('leases').toArray()) as Lease[];
        await tx
          .table('transactions')
          .toCollection()
          .modify((t: Record<string, unknown>) => {
            t.source ??= 'manual';
            t.leaseId ??= null;
            if (t.category === 'cleaning') t.category = 'maintenance';
            if (t.category === 'marketing') t.category = 'other_expense';
            // Link existing rent to the unit's lease that was active on the payment date.
            if (t.kind === 'income' && t.leaseId === null && typeof t.unitId === 'string') {
              const lease = leases.find(
                (l) =>
                  l.unitId === t.unitId &&
                  l.startDate <= String(t.date) &&
                  (l.endDate === null || l.endDate >= String(t.date)),
              );
              if (lease) t.leaseId = lease.id;
            }
          });
      });

    // v4: loans get day count, Euribor tenor and an optional actual balance (Step 7).
    // Existing variable loans keep the 3-month reset they were calculated with before.
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('loans')
          .toCollection()
          .modify((loan: Record<string, unknown>) => {
            loan.dayCount ??= '30/360';
            loan.actualBalance ??= null;
            if (loan.rateType === 'euribor') loan.euriborTenor ??= '3M';
          }),
      );

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
