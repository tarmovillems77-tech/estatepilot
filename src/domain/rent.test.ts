import { describe, expect, it } from 'vitest';
import { arrears, monthsBetween, rentLines, rentReceived, rentTotals } from './rent';
import type { Lease, TransactionInput } from './types';

const meta = { createdAt: '', updatedAt: '' };
const lease = (id: string, overrides: Partial<Lease> = {}): Lease => ({
  ...meta,
  id,
  unitId: `unit-${id}`,
  tenantId: `tenant-${id}`,
  startDate: '2026-01-01',
  endDate: null,
  monthlyRent: 1_000,
  deposit: 0,
  paymentDay: 5,
  annualIndexation: null,
  ...overrides,
});

const payment = (
  leaseId: string | null,
  date: string,
  amount: number,
  extra: Partial<TransactionInput> = {},
): TransactionInput =>
  ({
    kind: 'income',
    category: 'rent',
    propertyId: 'p',
    unitId: null,
    leaseId,
    date,
    amount,
    source: 'manual',
    ...extra,
  }) as TransactionInput;

describe('monthsBetween', () => {
  it('lists months across a year boundary', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthsBetween('2026-05', '2026-04')).toEqual([]);
  });
});

describe('rentReceived', () => {
  it('uses periodMonth when set and ignores unlinked or non-rent income', () => {
    const received = rentReceived([
      payment('a', '2026-03-05', 600),
      payment('a', '2026-04-02', 400, { periodMonth: '2026-03' }), // late payment for March
      payment(null, '2026-03-05', 999),
      payment('a', '2026-03-05', 50, { category: 'service_charges' }),
    ]);
    expect(received.get('a:2026-03')).toBe(1_000);
    expect(received.size).toBe(1);
  });
});

describe('rentLines', () => {
  const today = '2026-03-20';
  const leases = [
    lease('paid'),
    lease('partial'),
    lease('unpaid'),
    lease('later', { paymentDay: 25 }),
    lease('ended', { endDate: '2026-02-28' }),
    lease('future', { startDate: '2026-04-01' }),
  ];
  const transactions = [
    payment('paid', '2026-03-04', 1_000),
    payment('partial', '2026-03-05', 400),
  ];
  const lines = rentLines(leases, transactions, ['2026-03'], today);
  const status = Object.fromEntries(lines.map((l) => [l.leaseId, l.status]));

  it('only includes leases active on the due date', () => {
    expect(Object.keys(status).sort()).toEqual(['later', 'paid', 'partial', 'unpaid']);
  });

  it('classifies paid, partial, unpaid and not yet due rent', () => {
    expect(status).toEqual({
      paid: 'paid',
      partial: 'partial',
      unpaid: 'unpaid',
      later: 'upcoming',
    });
    expect(lines.find((l) => l.leaseId === 'partial')?.outstanding).toBe(600);
  });

  it('finds overdue rent and totals', () => {
    expect(
      arrears(lines, today)
        .map((l) => l.leaseId)
        .sort(),
    ).toEqual(['partial', 'unpaid']);
    expect(rentTotals(lines, today)).toEqual({
      expected: 4_000,
      received: 1_400,
      overdue: 1_600,
      upcoming: 1_000,
    });
  });

  it('treats an overpayment as paid without negative outstanding', () => {
    const [line] = rentLines([lease('x')], [payment('x', '2026-03-05', 1_200)], ['2026-03'], today);
    expect(line?.status).toBe('paid');
    expect(line?.outstanding).toBe(0);
  });
});
