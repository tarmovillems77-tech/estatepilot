import { daysBetween } from './dates';
import type { Lease, Unit } from './types';

/** ISO dates compare correctly as strings. */
export function isLeaseActive(
  lease: Pick<Lease, 'startDate' | 'endDate'>,
  onDate: string,
): boolean {
  return lease.startDate <= onDate && (lease.endDate === null || lease.endDate >= onDate);
}

/** Active fixed-term leases that end within `withinDays` of `onDate`. */
export function isLeaseEndingSoon(
  lease: Pick<Lease, 'startDate' | 'endDate'>,
  onDate: string,
  withinDays = 90,
): boolean {
  if (lease.endDate === null || !isLeaseActive(lease, onDate)) return false;
  return daysBetween(onDate, lease.endDate) <= withinDays;
}

/** Share of units with an active lease (0–1); null when there are no units. */
export function occupancyRate(
  units: readonly Pick<Unit, 'id'>[],
  leases: readonly Pick<Lease, 'unitId' | 'startDate' | 'endDate'>[],
  onDate: string,
): number | null {
  if (units.length === 0) return null;
  const leased = new Set(
    leases.filter((lease) => isLeaseActive(lease, onDate)).map((lease) => lease.unitId),
  );
  return units.filter((unit) => leased.has(unit.id)).length / units.length;
}
