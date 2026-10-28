import { addMonths, dayBefore, fromIsoDate, toIsoDate } from '../dates';
import { isLeaseActive } from '../leases';
import type {
  LeaseInput,
  LoanInput,
  PropertyInput,
  PropertyType,
  TransactionInput,
  UnitInput,
} from '../types';
import { amortizationSchedule, balanceOn, paymentsBetween } from './loan';
import { dscr, freeCashFlow, ltv, summarizeOperations } from './metrics';

/*
 * Year-by-year projection (year 1 = the 12 months starting next month).
 *
 *   Gross potential rent  = Σ rent streams; each grows yearly from year 2 by its own rate:
 *                           lease indexation → else property indexation → else the scenario's
 *                           market rent growth. Leases are assumed to renew on the same terms.
 *   Vacancy loss          = gross potential rent × vacancyRate
 *   Operating expenses    = last 12 months' operating expenses, grown by opexGrowth from year 1
 *   Capex reserve         = effective gross income × capexReserveRate
 *   Debt service          = actual schedule of each loan, with variable loans repriced from
 *                           the scenario's 3M Euribor for that year (see loan.ts)
 *   Free cash flow        = NOI − debt service − capex reserve
 *   Cash-on-cash          = free cash flow / equity invested
 */

export const FORECAST_YEARS = 5;

export const scenarioIds = ['optimistic', 'base', 'pessimistic'] as const;
export type ScenarioId = (typeof scenarioIds)[number];

export interface Scenario {
  /** Yearly market rent change from year 2, for rents without their own indexation. */
  rentGrowth: number;
  /** Share of potential rent lost to vacancy and arrears. */
  vacancyRate: number;
  /** Yearly operating expense change. */
  opexGrowth: number;
  /** Yearly market value change. */
  valueGrowth: number;
  /** Share of effective gross income set aside for capital expenditure. */
  capexReserveRate: number;
  /** 3-month Euribor for each forecast year; the last value repeats if the list is short. */
  euribor: readonly number[];
}

/** Default assumptions — starting points the user can change, not market predictions. */
export const defaultScenarios: Record<ScenarioId, Scenario> = {
  optimistic: {
    rentGrowth: 0.04,
    vacancyRate: 0.02,
    opexGrowth: 0.025,
    valueGrowth: 0.04,
    capexReserveRate: 0.03,
    euribor: [0.019, 0.017, 0.016, 0.016, 0.017],
  },
  base: {
    rentGrowth: 0.025,
    vacancyRate: 0.05,
    opexGrowth: 0.035,
    valueGrowth: 0.02,
    capexReserveRate: 0.05,
    euribor: [0.021, 0.022, 0.023, 0.024, 0.025],
  },
  pessimistic: {
    rentGrowth: 0,
    vacancyRate: 0.1,
    opexGrowth: 0.05,
    valueGrowth: -0.02,
    capexReserveRate: 0.08,
    euribor: [0.03, 0.035, 0.0375, 0.0375, 0.035],
  },
};

/** Operating expense estimate for properties without history (share of potential rent). */
export const defaultOpexRatio: Record<PropertyType, number> = {
  residential: 0.15,
  commercial: 0.1,
};

export interface RentStream {
  /** Annual rent today. */
  annualRent: number;
  /** Yearly indexation; null follows the scenario's market rent growth. */
  indexation: number | null;
}

export interface ForecastInput {
  /** First day of forecast year 1 (ISO). */
  startDate: string;
  /** Rent if fully let, one stream per unit (leased: contract rent, vacant: market rent). */
  rentStreams: readonly RentStream[];
  /** Annual service charges and other income; grows with market rent. */
  otherIncome: number;
  /** Annual operating expenses (latest 12 months or an estimate). */
  operatingExpenses: number;
  marketValue: number;
  /** Purchase price + acquisition costs − original loan principal. */
  equityInvested: number;
  /** Loans to project; pass modified copies to test other terms, margins or rates. */
  loans: readonly LoanInput[];
}

export interface ForecastYear {
  year: number;
  from: string;
  to: string;
  euribor: number;
  grossPotentialRent: number;
  vacancyLoss: number;
  otherIncome: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  noi: number;
  capexReserve: number;
  interest: number;
  principal: number;
  debtService: number;
  freeCashFlow: number;
  monthlyFreeCashFlow: number;
  /** At year end. */
  loanBalance: number;
  /** At year end. */
  propertyValue: number;
  equity: number;
  equityInvested: number;
  dscr: number | null;
  ltv: number | null;
  cashOnCash: number | null;
}

export function euriborForYear(scenario: Scenario, yearIndex: number): number {
  const path = scenario.euribor;
  return path[Math.min(Math.max(yearIndex, 0), path.length - 1)] ?? 0;
}

export function forecast(
  input: ForecastInput,
  scenario: Scenario,
  years = FORECAST_YEARS,
): ForecastYear[] {
  const start = fromIsoDate(input.startDate);
  const yearIndexOf = (isoDate: string) => {
    const date = fromIsoDate(isoDate);
    const months =
      (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
    return Math.floor(months / 12);
  };

  // Before the forecast starts, a loan keeps its own stored Euribor.
  const schedules = input.loans.map((loan) => ({
    loan,
    schedule: amortizationSchedule(loan, (date) =>
      date < input.startDate
        ? loan.rateType === 'euribor'
          ? loan.euribor
          : 0
        : euriborForYear(scenario, yearIndexOf(date)),
    ),
  }));

  const rows: ForecastYear[] = [];
  for (let year = 1; year <= years; year++) {
    const from = toIsoDate(addMonths(start, 12 * (year - 1)));
    const to = dayBefore(addMonths(start, 12 * year));
    const grown = (amount: number, rate: number) => amount * (1 + rate) ** (year - 1);

    const grossPotentialRent = input.rentStreams.reduce(
      (sum, stream) => sum + grown(stream.annualRent, stream.indexation ?? scenario.rentGrowth),
      0,
    );
    const vacancyLoss = grossPotentialRent * scenario.vacancyRate;
    const otherIncome = grown(input.otherIncome, scenario.rentGrowth);
    const effectiveGrossIncome = grossPotentialRent - vacancyLoss + otherIncome;
    const operatingExpenses = input.operatingExpenses * (1 + scenario.opexGrowth) ** year;
    const capexReserve = effectiveGrossIncome * scenario.capexReserveRate;

    let interest = 0;
    let principal = 0;
    let loanBalance = 0;
    for (const { loan, schedule } of schedules) {
      const paid = paymentsBetween(schedule, from, to);
      interest += paid.interest;
      principal += paid.principal;
      loanBalance += balanceOn(loan, schedule, to);
    }

    rows.push(
      withRatios({
        year,
        from,
        to,
        euribor: euriborForYear(scenario, year - 1),
        grossPotentialRent,
        vacancyLoss,
        otherIncome,
        effectiveGrossIncome,
        operatingExpenses,
        noi: effectiveGrossIncome - operatingExpenses,
        capexReserve,
        interest,
        principal,
        debtService: interest + principal,
        loanBalance,
        propertyValue: input.marketValue * (1 + scenario.valueGrowth) ** year,
        equityInvested: input.equityInvested,
      }),
    );
  }
  return rows;
}

type ForecastTotals = Omit<
  ForecastYear,
  'freeCashFlow' | 'monthlyFreeCashFlow' | 'equity' | 'dscr' | 'ltv' | 'cashOnCash'
>;

function withRatios(totals: ForecastTotals): ForecastYear {
  const fcf = freeCashFlow(totals.noi, totals.debtService, totals.capexReserve);
  return {
    ...totals,
    freeCashFlow: fcf,
    monthlyFreeCashFlow: fcf / 12,
    equity: totals.propertyValue - totals.loanBalance,
    dscr: dscr(totals.noi, totals.debtService),
    ltv: ltv(totals.loanBalance, totals.propertyValue),
    cashOnCash: totals.equityInvested > 0 ? fcf / totals.equityInvested : null,
  };
}

const summed = [
  'grossPotentialRent',
  'vacancyLoss',
  'otherIncome',
  'effectiveGrossIncome',
  'operatingExpenses',
  'noi',
  'capexReserve',
  'interest',
  'principal',
  'debtService',
  'loanBalance',
  'propertyValue',
  'equityInvested',
] as const;

/** Adds property forecasts year by year; ratios are recomputed from the totals. */
export function combineForecasts(forecasts: readonly ForecastYear[][]): ForecastYear[] {
  const first = forecasts[0];
  if (!first) return [];
  return first.map((row, index) => {
    const sameYear = forecasts.map((f) => f[index]).filter((r) => r !== undefined);
    const totals = Object.fromEntries(
      summed.map((key) => [key, sameYear.reduce((sum, r) => sum + r[key], 0)]),
    ) as Record<(typeof summed)[number], number>;
    return withRatios({
      ...totals,
      year: row.year,
      from: row.from,
      to: row.to,
      euribor: row.euribor,
    });
  });
}

export interface ForecastSource {
  property: Pick<
    PropertyInput,
    'type' | 'purchasePrice' | 'acquisitionCosts' | 'marketValue' | 'rentIndexation'
  >;
  units: readonly (Pick<UnitInput, 'marketRent'> & { id: string })[];
  leases: readonly Pick<
    LeaseInput,
    'unitId' | 'startDate' | 'endDate' | 'monthlyRent' | 'annualIndexation'
  >[];
  /** This property's transactions over the last 12 months. */
  trailingTransactions: readonly TransactionInput[];
  loans: readonly LoanInput[];
  asOf: Date;
}

/**
 * One rent stream per unit. Leased units: contract rent with the lease's indexation, else the
 * property's. Vacant units: market rent with the property's indexation (else market growth).
 */
export function rentStreamsFor(
  source: Pick<ForecastSource, 'property' | 'units' | 'leases'>,
  onDate: string,
): RentStream[] {
  const propertyIndexation = source.property.rentIndexation ?? null;
  return source.units.map((unit) => {
    const lease = source.leases.find((l) => l.unitId === unit.id && isLeaseActive(l, onDate));
    return lease
      ? {
          annualRent: lease.monthlyRent * 12,
          indexation: lease.annualIndexation ?? propertyIndexation,
        }
      : { annualRent: unit.marketRent * 12, indexation: propertyIndexation };
  });
}

/** Builds forecast input from stored data; properties without history get estimated costs. */
export function forecastInputFor(source: ForecastSource): ForecastInput {
  const { property, trailingTransactions, loans, asOf } = source;
  const rentStreams = rentStreamsFor(source, toIsoDate(asOf));
  const grossPotentialRent = rentStreams.reduce((sum, s) => sum + s.annualRent, 0);
  const history = summarizeOperations(trailingTransactions);
  const hasHistory = trailingTransactions.length > 0;
  const borrowed = loans.reduce((sum, loan) => sum + loan.principal, 0);

  return {
    startDate: toIsoDate(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1)),
    rentStreams,
    otherIncome: history.otherIncome,
    operatingExpenses: hasHistory
      ? history.operatingExpenses
      : grossPotentialRent * defaultOpexRatio[property.type],
    marketValue: property.marketValue,
    equityInvested: Math.max(0, property.purchasePrice + property.acquisitionCosts - borrowed),
    loans,
  };
}
