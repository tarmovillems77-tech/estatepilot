import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, toIsoDate } from './dates';
import { isLeaseActive, isLeaseEndingSoon, occupancyRate } from './leases';

describe('dates', () => {
  it('formats local dates without a timezone shift', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('clamps month arithmetic to the end of the month', () => {
    expect(toIsoDate(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(toIsoDate(addMonths(new Date(2026, 10, 15), -12))).toBe('2025-11-15');
  });

  it('counts days between ISO dates', () => {
    expect(daysBetween('2026-10-28', '2026-11-27')).toBe(30);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across the DST switch
  });
});

describe('isLeaseActive', () => {
  const lease = { startDate: '2026-01-01', endDate: '2026-12-31' };

  it('includes the start and end date', () => {
    expect(isLeaseActive(lease, '2026-01-01')).toBe(true);
    expect(isLeaseActive(lease, '2026-12-31')).toBe(true);
  });

  it('is inactive outside the term', () => {
    expect(isLeaseActive(lease, '2025-12-31')).toBe(false);
    expect(isLeaseActive(lease, '2027-01-01')).toBe(false);
  });

  it('treats a missing end date as open-ended', () => {
    expect(isLeaseActive({ startDate: '2020-01-01', endDate: null }, '2040-01-01')).toBe(true);
  });
});

describe('isLeaseEndingSoon', () => {
  it('flags active leases ending within the window', () => {
    const lease = { startDate: '2025-01-01', endDate: '2026-12-31' };
    expect(isLeaseEndingSoon(lease, '2026-10-28')).toBe(true);
    expect(isLeaseEndingSoon(lease, '2026-06-01')).toBe(false);
  });

  it('never flags open-ended leases', () => {
    expect(isLeaseEndingSoon({ startDate: '2025-01-01', endDate: null }, '2026-10-28')).toBe(false);
  });
});

describe('occupancyRate', () => {
  it('counts units with an active lease', () => {
    const units = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const leases = [
      { unitId: 'a', startDate: '2025-01-01', endDate: null },
      { unitId: 'b', startDate: '2025-01-01', endDate: '2025-12-31' }, // expired
      { unitId: 'c', startDate: '2026-01-01', endDate: '2027-12-31' },
    ];
    expect(occupancyRate(units, leases, '2026-10-28')).toBe(0.5);
  });

  it('returns null without units', () => {
    expect(occupancyRate([], [], '2026-10-28')).toBeNull();
  });
});
