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
import { arrears, monthsBetween, rentLines } from '@/domain/rent';
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

  it('books expenses for the last 12 full months and rent up to today', () => {
    const expenses = demo.transactions.filter((t) => t.kind === 'expense').map((t) => t.date);
    expect(expenses.every((d) => d >= '2025-10-01' && d < '2026-10-01')).toBe(true);
    const income = demo.transactions.filter((t) => t.kind === 'income').map((t) => t.date);
    expect(income.every((d) => d >= '2025-10-01' && d <= '2026-10-28')).toBe(true);
    expect(income.some((d) => d >= '2026-10-01')).toBe(true);
  });

  it('covers operating, capital and income categories', () => {
    const categories = new Set(demo.transactions.map((t) => t.category));
    for (const c of [
      'rent',
      'parking',
      'service_charges',
      'management',
      'maintenance',
      'repairs',
      'utilities',
      'insurance',
      'land_tax',
      'other_expense',
      'capex',
    ]) {
      expect(categories).toContain(c);
    }
  });

  it('links every rent payment to an active lease', () => {
    const leaseById = new Map(demo.leases.map((l) => [l.id, l]));
    const rent = demo.transactions.filter((t) => t.kind === 'income');
    expect(rent.length).toBeGreaterThan(0);
    for (const t of rent) {
      const lease = t.leaseId ? leaseById.get(t.leaseId) : undefined;
      expect(lease && isLeaseActive(lease, t.date)).toBe(true);
      expect(t.periodMonth).toBe(t.date.slice(0, 7));
    }
  });

  it('contains deliberate arrears: one partial and two unpaid rents', () => {
    const lines = rentLines(
      demo.leases,
      demo.transactions,
      monthsBetween('2025-10', '2026-10'),
      '2026-10-28',
    );
    const overdue = arrears(lines, '2026-10-28');
    expect(overdue.map((l) => l.status).sort()).toEqual(['partial', 'unpaid', 'unpaid']);
  });

  it('is deterministic for the same day', () => {
    const amounts = (data: typeof demo) => data.transactions.map((t) => t.amount);
    expect(amounts(buildDemoData(today))).toEqual(amounts(demo));
  });

  it('uses only reserved example.com e-mail addresses', () => {
    expect(demo.tenants.every((t) => t.email?.endsWith('@example.com'))).toBe(true);
  });
});
