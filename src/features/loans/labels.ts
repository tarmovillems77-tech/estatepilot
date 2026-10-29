import type { BalanceBasis, RateParts } from '@/domain/finance/loan';
import type { EuriborTenor } from '@/domain/types';
import { formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

const text = et.loans;
const pct = (value: number) => formatPercent(value, 2);

/** "6M Euribor 2,20% + marginaal 1,85% = 4,05%" or "4,95% fikseeritud". */
export function rateLabel(parts: RateParts, tenor?: EuriborTenor): string {
  if (parts.euribor === null || parts.margin === null) {
    return text.rateLabel.fixed(pct(parts.annualRate));
  }
  return text.rateLabel.variable(
    tenor ?? '',
    pct(parts.euribor),
    pct(parts.margin),
    pct(parts.annualRate),
  );
}

/** 240 → "20 a", 150 → "150 kuud" */
export function termLabel(months: number): string {
  return months % 12 === 0 ? text.years(months / 12) : text.months(months);
}

export const basisTone: Record<BalanceBasis, 'brand' | 'amber' | 'slate'> = {
  actual: 'brand',
  fromActual: 'brand',
  calculated: 'slate',
};
