import { trailingTwelveMonths } from '../dates';
import type { Loan, Property, Transaction } from '../types';
import { combinePerformance, propertyPerformance, type Performance } from './metrics';

export interface PortfolioPerformance {
  period: { from: string; to: string };
  byProperty: Map<string, Performance>;
  total: Performance;
}

/** Trailing-12-month performance of every owned property and of the whole portfolio. */
export function portfolioPerformance({
  properties,
  transactions,
  loans,
  asOf,
}: {
  properties: readonly Property[];
  /** May include other periods and properties; filtered here. */
  transactions: readonly Transaction[];
  loans: readonly Loan[];
  asOf: Date;
}): PortfolioPerformance {
  const period = trailingTwelveMonths(asOf);
  const inPeriod = transactions.filter((t) => t.date >= period.from && t.date <= period.to);

  const byProperty = new Map<string, Performance>();
  for (const property of properties) {
    if (property.status !== 'owned') continue;
    byProperty.set(
      property.id,
      propertyPerformance({
        property,
        transactions: inPeriod.filter((t) => t.propertyId === property.id),
        loans: loans.filter((l) => l.propertyId === property.id),
        period,
      }),
    );
  }

  return { period, byProperty, total: combinePerformance([...byProperty.values()]) };
}
