import { addMonths, dayBefore, fromIsoDate, toIsoDate } from '../dates';
import { effectiveIndexation, isLeaseActive } from '../leases';
import type {
  EuriborTenor,
  LeaseInput,
  LoanInput,
  PropertyInput,
  PropertyType,
  TransactionInput,
  UnitInput,
} from '../types';
import { amortizationSchedule, balanceOn, paymentsBetween, type ScheduleRow } from './loan';
import { dscr, freeCashFlow, ltv, summarizeOperations } from './metrics';

/*
 * Year-by-year projection (year 1 = the 12 months starting next month).
 *
 *   Gross potential rent  = Σ rent streams (one per unit); each grows yearly from year 2 by its
 *                           own rate: lease indexation → else property indexation → else the
 *                           scenario's market rent growth. Leases are assumed to renew on the
 *                           same terms. Nothing raises all rents by one common rate unless the
 *                           data leaves it to the market assumption.
 *   Vacancy loss          = gross potential rent × vacancyRate
 *   Rental income (EGI)   = gross potential rent − vacancy loss + other income
 *   Operating expenses    = last 12 months' operating expenses × (1 + opexAdjustment),
 *                           grown by opexGrowth from year 1
 *   Maintenance reserve   = area (m²) × maintenanceReservePerM2, grown by opexGrowth from year 2
 *   NOI                   = rental income − operating expenses − maintenance reserve
 *   Capex reserve         = rental income × capexReserveRate (capital repairs, after NOI)
 *   Debt service          = each loan's own schedule: interest and principal separately;
 *                           variable loans repriced from the scenario's 3M or 6M Euribor
 *                           (matching the loan) and margin change (see loan.ts)
 *   Free cash flow        = NOI − debt service − capex reserve
 *   Property value        = market value × (1 + valueGrowth)^year
 *   Equity                = property value − loan balance. Free cash flow is NOT added to
 *                           equity: value change and principal repayment are its only drivers.
 *   Net yield             = NOI / (purchase price + acquisition costs)
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
  /** Change of the operating-expense level against the last 12 months (0.1 = +10%). */
  opexAdjustment: number;
  /** Yearly operating expense change. */
  opexGrowth: number;
  /** Planned maintenance reserve in € per m² per year (part of operating costs). */
  maintenanceReservePerM2: number;
  /** Yearly market value change; negative = depreciation. */
  valueGrowth: number;
  /** Share of rental income set aside for capital repairs. */
  capexReserveRate: number;
  /** 3- and 6-month Euribor for each forecast year; the last value repeats. */
  euribor3m: readonly number[];
  euribor6m: readonly number[];
  /** Change of every variable loan's margin from the forecast start (0.005 = +0,5 pp). */
  marginChange: number;
}

/** Default assumptions — starting points the user can change, not market predictions. */
export const defaultScenarios: Record<ScenarioId, Scenario> = {
  optimistic: {
    rentGrowth: 0.04,
    vacancyRate: 0.02,
    opexAdjustment: 0,
    opexGrowth: 0.025,
    maintenanceReservePerM2: 0,
    valueGrowth: 0.04,
    capexReserveRate: 0.03,
    euribor3m: [0.019, 0.017, 0.016, 0.016, 0.017],
    euribor6m: [0.02, 0.018, 0.017, 0.017, 0.018],
    marginChange: 0,
  },
  base: {
    rentGrowth: 0.025,
    vacancyRate: 0.05,
    opexAdjustment: 0,
    opexGrowth: 0.035,
    maintenanceReservePerM2: 0,
    valueGrowth: 0.02,
    capexReserveRate: 0.05,
    euribor3m: [0.021, 0.022, 0.023, 0.024, 0.025],
    euribor6m: [0.022, 0.023, 0.024, 0.025, 0.026],
    marginChange: 0,
  },
  pessimistic: {
    rentGrowth: 0,
    vacancyRate: 0.1,
    opexAdjustment: 0,
    opexGrowth: 0.05,
    maintenanceReservePerM2: 0,
    valueGrowth: -0.02,
    capexReserveRate: 0.08,
    euribor3m: [0.03, 0.035, 0.0375, 0.0375, 0.035],
    euribor6m: [0.031, 0.036, 0.0385, 0.0385, 0.036],
    marginChange: 0,
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

/** A loan as projected: optionally with a different margin from the forecast start. */
export type ForecastLoan = LoanInput & { forecastMargin?: number };

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
  /** Overrides the scenario's value change for this property. */
  valueGrowth?: number;
  /** Net area in m² (for the maintenance reserve). */
  area?: number;
  /** Purchase price + acquisition costs (for net yield). */
  totalInvestment?: number;
  /** Purchase price + acquisition costs − original loan principal. */
  equityInvested: number;
  /** Loans to project; pass modified copies to test other terms, margins or rates. */
  loans: readonly ForecastLoan[];
}

export interface ForecastYear {
  year: number;
  from: string;
  to: string;
  euribor3m: number;
  euribor6m: number;
  grossPotentialRent: number;
  vacancyLoss: number;
  otherIncome: number;
  /** Rental income after vacancy, incl. other income. */
  effectiveGrossIncome: number;
  operatingExpenses: number;
  maintenanceReserve: number;
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
  totalInvestment: number;
  netYield: number | null;
  dscr: number | null;
  ltv: number | null;
  cashOnCash: number | null;
}

export function euriborForYear(path: readonly number[], yearIndex: number): number {
  return path[Math.min(Math.max(yearIndex, 0), path.length - 1)] ?? 0;
}

export function euriborPath(scenario: Scenario, tenor: EuriborTenor): readonly number[] {
  return tenor === '6M' ? scenario.euribor6m : scenario.euribor3m;
}

/**
 * Schedule of a loan under a scenario: its own stored Euribor before the forecast start, the
 * scenario path for its tenor (by forecast year) afterwards, and the margin change from the
 * start (scenario-wide change, plus the loan's own forecast margin if set).
 */
export function scenarioSchedule(
  loan: ForecastLoan,
  scenario: Scenario,
  startDate: string,
): ScheduleRow[] {
  const start = fromIsoDate(startDate);
  const yearIndexOf = (isoDate: string) => {
    const date = fromIsoDate(isoDate);
    const months =
      (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
    return Math.floor(months / 12);
  };
  if (loan.rateType !== 'euribor') return amortizationSchedule(loan);

  const path = euriborPath(scenario, loan.euriborTenor);
  const ownMarginDelta = loan.forecastMargin === undefined ? 0 : loan.forecastMargin - loan.margin;
  return amortizationSchedule(
    loan,
    (date) => (date < startDate ? loan.euribor : euriborForYear(path, yearIndexOf(date))),
    {
      marginDelta: (date) => (date < startDate ? 0 : ownMarginDelta + scenario.marginChange),
    },
  );
}

export function forecast(
  input: ForecastInput,
  scenario: Scenario,
  years = FORECAST_YEARS,
): ForecastYear[] {
  const start = fromIsoDate(input.startDate);
  const schedules = input.loans.map((loan) => ({
    loan,
    schedule: scenarioSchedule(loan, scenario, input.startDate),
  }));
  const valueGrowth = input.valueGrowth ?? scenario.valueGrowth;

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
    const operatingExpenses =
      input.operatingExpenses * (1 + scenario.opexAdjustment) * (1 + scenario.opexGrowth) ** year;
    const maintenanceReserve = grown(
      (input.area ?? 0) * scenario.maintenanceReservePerM2,
      scenario.opexGrowth,
    );
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
        euribor3m: euriborForYear(scenario.euribor3m, year - 1),
        euribor6m: euriborForYear(scenario.euribor6m, year - 1),
        grossPotentialRent,
        vacancyLoss,
        otherIncome,
        effectiveGrossIncome,
        operatingExpenses,
        maintenanceReserve,
        noi: effectiveGrossIncome - operatingExpenses - maintenanceReserve,
        capexReserve,
        interest,
        principal,
        debtService: interest + principal,
        loanBalance,
        propertyValue: input.marketValue * (1 + valueGrowth) ** year,
        equityInvested: input.equityInvested,
        totalInvestment: input.totalInvestment ?? 0,
      }),
    );
  }
  return rows;
}

type ForecastTotals = Omit<
  ForecastYear,
  'freeCashFlow' | 'monthlyFreeCashFlow' | 'equity' | 'netYield' | 'dscr' | 'ltv' | 'cashOnCash'
>;

function withRatios(totals: ForecastTotals): ForecastYear {
  const fcf = freeCashFlow(totals.noi, totals.debtService, totals.capexReserve);
  return {
    ...totals,
    freeCashFlow: fcf,
    monthlyFreeCashFlow: fcf / 12,
    // Only value and loan balance: accumulated cash flow is reported separately.
    equity: totals.propertyValue - totals.loanBalance,
    netYield: totals.totalInvestment > 0 ? totals.noi / totals.totalInvestment : null,
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
  'maintenanceReserve',
  'noi',
  'capexReserve',
  'interest',
  'principal',
  'debtService',
  'loanBalance',
  'propertyValue',
  'equityInvested',
  'totalInvestment',
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
      euribor3m: row.euribor3m,
      euribor6m: row.euribor6m,
    });
  });
}

/** Free cash flow added up year by year — shown next to equity, never added to it. */
export function cumulativeFreeCashFlow(years: readonly ForecastYear[]): number[] {
  let total = 0;
  return years.map((y) => (total += y.freeCashFlow));
}

export interface ForecastSource {
  property: Pick<
    PropertyInput,
    'type' | 'purchasePrice' | 'acquisitionCosts' | 'marketValue' | 'rentIndexation' | 'totalArea'
  >;
  units: readonly (Pick<UnitInput, 'marketRent'> & { id: string; area?: number })[];
  leases: readonly Pick<
    LeaseInput,
    'unitId' | 'startDate' | 'endDate' | 'monthlyRent' | 'annualIndexation'
  >[];
  /** This property's transactions over the last 12 months. */
  trailingTransactions: readonly TransactionInput[];
  loans: readonly ForecastLoan[];
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
  return source.units.map((unit) => {
    const lease = source.leases.find((l) => l.unitId === unit.id && isLeaseActive(l, onDate));
    const indexation = effectiveIndexation(lease, source.property).rate;
    return lease
      ? { annualRent: lease.monthlyRent * 12, indexation }
      : { annualRent: unit.marketRent * 12, indexation };
  });
}

/** First day of the forecast: the first day of next month. */
export function forecastStart(asOf: Date): string {
  return toIsoDate(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1));
}

/** Builds forecast input from stored data; properties without history get estimated costs. */
export function forecastInputFor(source: ForecastSource): ForecastInput {
  const { property, units, trailingTransactions, loans, asOf } = source;
  const rentStreams = rentStreamsFor(source, toIsoDate(asOf));
  const grossPotentialRent = rentStreams.reduce((sum, s) => sum + s.annualRent, 0);
  const history = summarizeOperations(trailingTransactions);
  const hasHistory = trailingTransactions.length > 0;
  const borrowed = loans.reduce((sum, loan) => sum + loan.principal, 0);
  const totalInvestment = property.purchasePrice + property.acquisitionCosts;

  return {
    startDate: forecastStart(asOf),
    rentStreams,
    otherIncome: history.otherIncome,
    operatingExpenses: hasHistory
      ? history.operatingExpenses
      : grossPotentialRent * defaultOpexRatio[property.type],
    marketValue: property.marketValue,
    area: property.totalArea ?? units.reduce((sum, u) => sum + (u.area ?? 0), 0),
    totalInvestment,
    equityInvested: Math.max(0, totalInvestment - borrowed),
    loans,
  };
}
