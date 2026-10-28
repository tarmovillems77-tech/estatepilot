import { describe, expect, it } from 'vitest';
import { isLeaseActive, occupancyRate } from '@/domain/leases';
import {
  leaseSchema,
  loanSchema,
  propertySchema,
  tenantSchema,
  transactionSchema,
  unitSchema,
} from '@/domain/schemas';
import { buildDemoData } from './demo';

const today = new Date(2026, 9, 28);
const demo = buildDemoData(today);

describe('buildDemoData', () => {
  it('produces records that pass validation', () => {
    const checks = [
      [propertySchema, demo.properties],
      [unitSchema, demo.units],
      [tenantSchema, demo.tenants],
      [leaseSchema, demo.leases],
      [transactionSchema, demo.transactions],
      [loanSchema, demo.loans],
    ] as const;
    for (const [schema, records] of checks) {
      for (const record of records) expect(() => schema.parse(record)).not.toThrow();
    }
  });

  it('keeps references consistent', () => {
    const ids = (records: { id: string }[]) => new Set(records.map((r) => r.id));
    const propertyIds = ids(demo.properties);
    const unitIds = ids(demo.units);
    const tenantIds = ids(demo.tenants);

    expect(demo.units.every((u) => propertyIds.has(u.propertyId))).toBe(true);
    expect(demo.leases.every((l) => unitIds.has(l.unitId) && tenantIds.has(l.tenantId))).toBe(true);
    expect(demo.loans.every((l) => propertyIds.has(l.propertyId))).toBe(true);
    expect(
      demo.transactions.every(
        (t) => propertyIds.has(t.propertyId) && (t.unitId === null || unitIds.has(t.unitId)),
      ),
    ).toBe(true);
  });

  it('never has two active leases on the same unit', () => {
    for (const unit of demo.units) {
      const unitLeases = demo.leases.filter((l) => l.unitId === unit.id);
      for (const a of unitLeases) {
        for (const b of unitLeases) {
          if (a === b) continue;
          expect(isLeaseActive(b, a.startDate)).toBe(false);
        }
      }
    }
  });

  it('covers residential, commercial and prospect properties', () => {
    const owned = demo.properties.filter((p) => p.status === 'owned');
    expect(new Set(owned.map((p) => p.type))).toEqual(new Set(['residential', 'commercial']));
    expect(demo.properties.some((p) => p.status === 'prospect')).toBe(true);
  });

  it('has a vacancy in the owned portfolio', () => {
    const ownedIds = new Set(demo.properties.filter((p) => p.status === 'owned').map((p) => p.id));
    const ownedUnits = demo.units.filter((u) => ownedIds.has(u.propertyId));
    expect(occupancyRate(ownedUnits, demo.leases, '2026-10-28')).toBe(9 / 10);
  });

  it('generates 12 months of history ending before the current month', () => {
    const dates = demo.transactions.map((t) => t.date);
    expect(dates.every((d) => d >= '2025-10-01' && d < '2026-10-01')).toBe(true);
    expect(demo.transactions.some((t) => t.kind === 'expense' && t.category === 'capex')).toBe(
      true,
    );
  });

  it('is deterministic for the same day', () => {
    const amounts = (data: typeof demo) => data.transactions.map((t) => t.amount);
    expect(amounts(buildDemoData(today))).toEqual(amounts(demo));
  });

  it('uses only reserved example.com e-mail addresses', () => {
    expect(demo.tenants.every((t) => t.email?.endsWith('@example.com'))).toBe(true);
  });
});
