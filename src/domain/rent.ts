import { rentCategories } from './categories';
import { isLeaseActive } from './leases';
import type { Lease, TransactionInput } from './types';

/*
 * Rent tracking: expected rent per lease and month compared with rent actually received.
 *
 * - Rent is due for a month when the lease is active on that month's payment day; the full
 *   monthly rent is expected (no pro-rating of partial months).
 * - A payment counts towards a lease and month when it is rent or parking income linked to the
 *   lease (`leaseId`). Its month is `periodMonth`, or the payment date's month if not set, so
 *   late or early payments can be assigned to the right month.
 * - Service charges are tracked as other income and are not part of the rent due.
 */

export type RentStatus = 'paid' | 'partial' | 'unpaid' | 'upcoming';

export interface RentLine {
  leaseId: string;
  unitId: string;
  tenantId: string;
  /** "YYYY-MM" */
  month: string;
  dueDate: string;
  expected: number;
  received: number;
  /** expected − received, never negative. */
  outstanding: number;
  status: RentStatus;
}

/** Amounts below one cent are treated as settled. */
const TOLERANCE = 0.005;

export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

export function dueDateIn(month: string, paymentDay: number): string {
  return `${month}-${String(paymentDay).padStart(2, '0')}`;
}

/** Inclusive list of months, e.g. ("2026-11", "2027-01") → ["2026-11", "2026-12", "2027-01"]. */
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const months: string[] = [];
  let [year = 0, month = 1] = fromMonth.split('-').map(Number);
  for (let guard = 0; guard < 1200; guard++) {
    const current = `${year}-${String(month).padStart(2, '0')}`;
    if (current > toMonth) break;
    months.push(current);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** Rent received per lease and month, keyed "leaseId:YYYY-MM". */
export function rentReceived(transactions: readonly TransactionInput[]): Map<string, number> {
  const received = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'income' || !rentCategories.has(t.category) || t.leaseId === null) continue;
    const key = `${t.leaseId}:${t.periodMonth ?? monthOf(t.date)}`;
    received.set(key, (received.get(key) ?? 0) + t.amount);
  }
  return received;
}

export function rentStatus(
  line: Pick<RentLine, 'expected' | 'received' | 'dueDate'>,
  today: string,
) {
  if (line.received >= line.expected - TOLERANCE) return 'paid';
  if (line.received > TOLERANCE) return 'partial';
  return line.dueDate > today ? 'upcoming' : 'unpaid';
}

/** Expected vs received rent for every lease with rent due in the given months. */
export function rentLines(
  leases: readonly Lease[],
  transactions: readonly TransactionInput[],
  months: readonly string[],
  today: string,
): RentLine[] {
  const received = rentReceived(transactions);
  const lines: RentLine[] = [];
  for (const month of months) {
    for (const lease of leases) {
      const dueDate = dueDateIn(month, lease.paymentDay);
      if (!isLeaseActive(lease, dueDate)) continue;
      const got = received.get(`${lease.id}:${month}`) ?? 0;
      const line = {
        leaseId: lease.id,
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        month,
        dueDate,
        expected: lease.monthlyRent,
        received: got,
        outstanding: Math.max(0, lease.monthlyRent - got),
      };
      lines.push({ ...line, status: rentStatus(line, today) });
    }
  }
  return lines;
}

/** Overdue rent: unpaid or partially paid lines whose due date has passed. */
export function arrears(lines: readonly RentLine[], today: string): RentLine[] {
  return lines.filter(
    (l) => (l.status === 'unpaid' || l.status === 'partial') && l.dueDate <= today,
  );
}

export interface RentTotals {
  expected: number;
  received: number;
  /** Overdue amount still to be received. */
  overdue: number;
  /** Not yet due. */
  upcoming: number;
}

export function rentTotals(lines: readonly RentLine[], today: string): RentTotals {
  const totals: RentTotals = { expected: 0, received: 0, overdue: 0, upcoming: 0 };
  for (const line of lines) {
    totals.expected += line.expected;
    totals.received += line.received;
    if (line.dueDate > today) totals.upcoming += line.outstanding;
    else totals.overdue += line.outstanding;
  }
  return totals;
}
