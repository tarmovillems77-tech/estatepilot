import { toIsoDate, trailingTwelveMonths } from '../dates';
import type { Lease, Loan, Property, Transaction, Unit } from '../types';
import {
  combineForecasts,
  forecast,
  forecastInputFor,
  type ForecastYear,
  type Scenario,
} from './forecast';
import { combinePerformance, propertyPerformance, type Performance } from './metrics';

export interface PortfolioPerformance {
  period: { from: string; to: string };
  byProperty: Map<string, Performance>;
  /** Debt service and balance of loans not tied to one property; null when there are none. */
  portfolioLoans: Performance | null;
  total: Performance;
}

interface PortfolioData {
  properties: readonly Property[];
  /** May include other periods and properties; filtered here. */
  transactions: readonly Transaction[];
  loans: readonly Loan[];
  asOf: Date;
}

const inPeriod = (transactions: readonly Transaction[], period: { from: string; to: string }) =>
  transactions.filter((t) => t.date >= period.from && t.date <= period.to);

/**
 * Trailing-12-month performance of every owned property and of the whole portfolio.
 * Loan balances (and LTV) are as of `asOf`. Portfolio-level loans count only in the total.
 */
export function portfolioPerformance({
  properties,
  transactions,
  loans,
  asOf,
}: PortfolioData): PortfolioPerformance {
  const period = trailingTwelveMonths(asOf);
  const balanceDate = toIsoDate(asOf);
  const recent = inPeriod(transactions, period);

  const byProperty = new Map<string, Performance>();
  for (const property of properties) {
    if (property.status !== 'owned') continue;
    byProperty.set(
      property.id,
      propertyPerformance({
        property,
        transactions: recent.filter((t) => t.propertyId === property.id),
        loans: loans.filter((l) => l.propertyId === property.id),
        period,
        balanceDate,
      }),
    );
  }

  const unassigned = loans.filter((l) => l.propertyId === null);
  const portfolioLoans =
    unassigned.length === 0
      ? null
      : propertyPerformance({
          property: { purchasePrice: 0, acquisitionCosts: 0, marketValue: 0 },
          transactions: [],
          loans: unassigned,
          period,
          balanceDate,
        });

  return {
    period,
    byProperty,
    portfolioLoans,
    total: combinePerformance([
      ...byProperty.values(),
      ...(portfolioLoans ? [portfolioLoans] : []),
    ]),
  };
}

/**
 * Forecast of all owned properties combined, from today's rent roll and the last 12 months.
 * Portfolio-level loans are added as debt without income.
 */
export function portfolioForecast({
  properties,
  units,
  leases,
  transactions,
  loans,
  asOf,
  scenario,
}: PortfolioData & {
  units: readonly Unit[];
  leases: readonly Lease[];
  scenario: Scenario;
}): ForecastYear[] {
  const recent = inPeriod(transactions, trailingTwelveMonths(asOf));
  const unassigned = loans.filter((l) => l.propertyId === null);
  const portfolioDebt =
    unassigned.length === 0
      ? []
      : [
          forecast(
            {
              startDate: toIsoDate(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1)),
              rentStreams: [],
              otherIncome: 0,
              operatingExpenses: 0,
              marketValue: 0,
              equityInvested: 0,
              loans: unassigned,
            },
            scenario,
          ),
        ];

  return combineForecasts([
    ...properties
      .filter((p) => p.status === 'owned')
      .map((property) => {
        const propertyUnits = units.filter((u) => u.propertyId === property.id);
        const unitIds = new Set(propertyUnits.map((u) => u.id));
        return forecast(
          forecastInputFor({
            property,
            units: propertyUnits,
            leases: leases.filter((l) => unitIds.has(l.unitId)),
            trailingTransactions: recent.filter((t) => t.propertyId === property.id),
            loans: loans.filter((l) => l.propertyId === property.id),
            asOf,
          }),
          scenario,
        );
      }),
    ...portfolioDebt,
  ]);
}
