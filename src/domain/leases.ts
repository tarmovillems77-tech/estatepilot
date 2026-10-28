import { daysBetween } from './dates';
import type { Lease, Property, Unit } from './types';

/** Leases ending within this many days are flagged in the UI. */
export const LEASE_ALERT_DAYS = 90;

type LeaseTerm = Pick<Lease, 'startDate' | 'endDate'>;

/** ISO dates compare correctly as strings. */
export function isLeaseActive(lease: LeaseTerm, onDate: string): boolean {
  return lease.startDate <= onDate && (lease.endDate === null || lease.endDate >= onDate);
}

/** Active fixed-term leases that end within `withinDays` of `onDate`. */
export function isLeaseEndingSoon(
  lease: LeaseTerm,
  onDate: string,
  withinDays = LEASE_ALERT_DAYS,
): boolean {
  if (lease.endDate === null || !isLeaseActive(lease, onDate)) return false;
  return daysBetween(onDate, lease.endDate) <= withinDays;
}

export type LeaseStatus = 'upcoming' | 'active' | 'endingSoon' | 'ended';

export function leaseStatus(lease: LeaseTerm, onDate: string): LeaseStatus {
  if (lease.startDate > onDate) return 'upcoming';
  if (lease.endDate !== null && lease.endDate < onDate) return 'ended';
  return isLeaseEndingSoon(lease, onDate) ? 'endingSoon' : 'active';
}

/** Two terms overlap when they share at least one day; open ends run indefinitely. */
export function leasesOverlap(a: LeaseTerm, b: LeaseTerm): boolean {
  return a.startDate <= (b.endDate ?? '9999-12-31') && b.startDate <= (a.endDate ?? '9999-12-31');
}

export interface EffectiveIndexation {
  /** Yearly rate, or null when the forecast scenario's market rent growth applies. */
  rate: number | null;
  source: 'lease' | 'property' | 'scenario';
}

/** Which indexation applies to a lease: its own, else the property default, else the scenario. */
export function effectiveIndexation(
  lease: Pick<Lease, 'annualIndexation'> | undefined,
  property: Pick<Property, 'rentIndexation'>,
): EffectiveIndexation {
  if (lease && lease.annualIndexation !== null) {
    return { rate: lease.annualIndexation, source: 'lease' };
  }
  const propertyRate = property.rentIndexation ?? null;
  return propertyRate === null
    ? { rate: null, source: 'scenario' }
    : { rate: propertyRate, source: 'property' };
}

export interface RentRoll {
  /** Monthly rent from active leases. */
  contractRent: number;
  /** Monthly market rent of vacant units. */
  vacantMarketRent: number;
  /** contractRent + vacantMarketRent: monthly rent if every unit were let. */
  potentialRent: number;
}

/** Monthly rent roll on a date: leased units at contract rent, vacant units at market rent. */
export function rentRoll(
  units: readonly Pick<Unit, 'id' | 'marketRent'>[],
  leases: readonly Pick<Lease, 'unitId' | 'startDate' | 'endDate' | 'monthlyRent'>[],
  onDate: string,
): RentRoll {
  const activeRent = new Map<string, number>();
  for (const lease of leases) {
    if (isLeaseActive(lease, onDate)) {
      activeRent.set(lease.unitId, (activeRent.get(lease.unitId) ?? 0) + lease.monthlyRent);
    }
  }

  let contractRent = 0;
  let vacantMarketRent = 0;
  for (const unit of units) {
    const rent = activeRent.get(unit.id);
    if (rent === undefined) vacantMarketRent += unit.marketRent;
    else contractRent += rent;
  }
  return { contractRent, vacantMarketRent, potentialRent: contractRent + vacantMarketRent };
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
