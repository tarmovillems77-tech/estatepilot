import type { EffectiveIndexation, LeaseStatus } from '@/domain/leases';
import { formatDate, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

const text = et.leases;

/** "3,0% (lepingus)", "2,0% (objekti vaikimisi)", "0% (üür ei muutu)", "Stsenaariumi järgi". */
export function indexationLabel({ rate, source }: EffectiveIndexation): string {
  if (rate === null) return text.indexation.scenario;
  if (rate === 0) return text.indexation.none;
  return source === 'lease'
    ? text.indexation.lease(formatPercent(rate))
    : text.indexation.property(formatPercent(rate));
}

export function termLabel(lease: { startDate: string; endDate: string | null }): string {
  return `${formatDate(lease.startDate)} – ${lease.endDate ? formatDate(lease.endDate) : text.openEnded}`;
}

export const statusTone: Record<LeaseStatus, 'brand' | 'amber' | 'slate'> = {
  active: 'brand',
  endingSoon: 'amber',
  upcoming: 'slate',
  ended: 'slate',
};
