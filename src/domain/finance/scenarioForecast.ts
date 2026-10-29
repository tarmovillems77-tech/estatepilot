import { addMonths, dayBefore, fromIsoDate, toIsoDate, trailingTwelveMonths } from '../dates';
import type { LoanInput, RefinanceSettings, ScenarioSetInput, Transaction } from '../types';
import type { DashboardData } from './dashboard';
import {
  combineForecasts,
  defaultScenarios,
  euriborForYear,
  euriborPath,
  FORECAST_YEARS,
  forecast,
  forecastInputFor,
  forecastStart,
  scenarioIds,
  scenarioSchedule,
  type ForecastInput,
  type ForecastLoan,
  type ForecastYear,
  type Scenario,
  type ScenarioId,
} from './forecast';
import { amortizationSchedule, balanceOn, type ScheduleRow } from './loan';

/*
 * Runs a scenario set (three scenarios + overrides) against stored data. Stored records are
 * only read: overrides become modified copies inside the calculation.
 */

export const defaultRefinance: RefinanceSettings = {
  enabled: true,
  margin: 0.02,
  euriborTenor: '6M',
  termYears: 20,
  feesPerLoan: 1_000,
};

export function defaultScenarioSet(name: string): ScenarioSetInput {
  return {
    name,
    scenarios: structuredClone(defaultScenarios) as ScenarioSetInput['scenarios'],
    propertyOverrides: {},
    loanOverrides: {},
    refinance: { ...defaultRefinance },
  };
}

type LoanOverride = ScenarioSetInput['loanOverrides'][string];

/**
 * Margin override: applies from the forecast start (variable loans).
 * Remaining-term override: the balance at the forecast start is re-amortised over the new
 * number of years, as a refinancing of the term would.
 */
export function applyLoanOverride(
  loan: LoanInput,
  override: LoanOverride | undefined,
  startDate: string,
): ForecastLoan {
  let result: ForecastLoan = loan;
  if (override?.margin != null && loan.rateType === 'euribor') {
    result = { ...result, forecastMargin: override.margin };
  }
  if (override?.remainingYears != null) {
    const before = dayBefore(fromIsoDate(startDate));
    const schedule = amortizationSchedule(loan);
    const paymentsMade = schedule.filter((r) => r.date <= before).length;
    result = {
      ...result,
      actualBalance: { amount: balanceOn(loan, schedule, before), date: before },
      termMonths: paymentsMade + override.remainingYears * 12,
    };
  }
  return result;
}

export interface RefinanceSide {
  monthlyPayment: number;
  /** First 12 payments after refinancing. */
  annualDebtService: number;
  /** Interest in the first 60 months after refinancing. */
  interestFiveYears: number;
  /** Balance-weighted interest rate. */
  annualRate: number;
}

export interface RefinanceOutcome {
  /** Day after the last forecast year. */
  date: string;
  loans: number;
  balance: number;
  fees: number;
  current: RefinanceSide;
  refinanced: RefinanceSide;
  /** NOI of the last forecast year, used for the DSCR comparison. */
  noi: number;
  dscrCurrent: number | null;
  dscrRefinanced: number | null;
}

function side(rows: readonly ScheduleRow[]): Omit<RefinanceSide, 'annualRate'> {
  const sum = (list: readonly ScheduleRow[], key: 'payment' | 'interest') =>
    list.reduce((total, r) => total + r[key], 0);
  return {
    monthlyPayment: rows[0]?.payment ?? 0,
    annualDebtService: sum(rows.slice(0, 12), 'payment'),
    interestFiveYears: sum(rows.slice(0, 60), 'interest'),
  };
}

/**
 * Refinancing at the end of the forecast: every loan's projected balance moves to a new
 * Euribor loan with the given margin, tenor and term; the Euribor is the scenario's last value
 * for that tenor. The current loans continue at their scenario rates for comparison.
 */
export function refinanceAfterForecast(
  loans: readonly ForecastLoan[],
  scenario: Scenario,
  settings: RefinanceSettings,
  startDate: string,
  noi: number,
): RefinanceOutcome {
  const date = toIsoDate(addMonths(fromIsoDate(startDate), 12 * FORECAST_YEARS));
  const lastDay = dayBefore(fromIsoDate(date));
  const newEuribor = euriborForYear(
    euriborPath(scenario, settings.euriborTenor),
    FORECAST_YEARS - 1,
  );

  const totals = {
    loans: 0,
    balance: 0,
    current: { monthlyPayment: 0, annualDebtService: 0, interestFiveYears: 0, rateWeight: 0 },
    refinanced: { monthlyPayment: 0, annualDebtService: 0, interestFiveYears: 0, rateWeight: 0 },
  };
  for (const loan of loans) {
    const schedule = scenarioSchedule(loan, scenario, startDate);
    const balance = balanceOn(loan, schedule, lastDay);
    if (balance < 1) continue;
    const continuing = schedule.filter((r) => r.date > lastDay);
    const replacement: LoanInput = {
      rateType: 'euribor',
      euriborTenor: settings.euriborTenor,
      margin: settings.margin,
      euribor: newEuribor,
      propertyId: loan.propertyId,
      lender: loan.lender,
      principal: balance,
      startDate: lastDay,
      termMonths: settings.termYears * 12,
      repaymentType: loan.repaymentType,
      dayCount: loan.dayCount,
      actualBalance: null,
    };
    const newRows = amortizationSchedule(replacement);
    const before = side(continuing);
    const after = side(newRows);

    totals.loans += 1;
    totals.balance += balance;
    for (const [target, values, rate] of [
      [totals.current, before, continuing[0]?.annualRate ?? 0],
      [totals.refinanced, after, newRows[0]?.annualRate ?? 0],
    ] as const) {
      target.monthlyPayment += values.monthlyPayment;
      target.annualDebtService += values.annualDebtService;
      target.interestFiveYears += values.interestFiveYears;
      target.rateWeight += rate * balance;
    }
  }

  const finish = (t: typeof totals.current): RefinanceSide => ({
    monthlyPayment: t.monthlyPayment,
    annualDebtService: t.annualDebtService,
    interestFiveYears: t.interestFiveYears,
    annualRate: totals.balance > 0 ? t.rateWeight / totals.balance : 0,
  });
  const ratio = (debt: number) => (debt > 0 ? noi / debt : null);
  return {
    date,
    loans: totals.loans,
    balance: totals.balance,
    fees: totals.loans * settings.feesPerLoan,
    current: finish(totals.current),
    refinanced: finish(totals.refinanced),
    noi,
    dscrCurrent: ratio(totals.current.annualDebtService),
    dscrRefinanced: ratio(totals.refinanced.annualDebtService),
  };
}

export interface ScenarioRun {
  startDate: string;
  /** Forecast inputs per owned property (after overrides), for showing assumptions. */
  inputs: Map<string, ForecastInput>;
  byProperty: Map<string, Record<ScenarioId, ForecastYear[]>>;
  /** Portfolio-level loans: debt without income. */
  portfolioLoans: Record<ScenarioId, ForecastYear[]> | null;
  total: Record<ScenarioId, ForecastYear[]>;
  refinance: Record<ScenarioId, RefinanceOutcome> | null;
}

const byScenario = <T>(value: (id: ScenarioId) => T) =>
  Object.fromEntries(scenarioIds.map((id) => [id, value(id)])) as Record<ScenarioId, T>;

/** Five-year forecast of every owned property in `data` and their total, per scenario. */
export function runScenarioSet(
  data: DashboardData,
  set: ScenarioSetInput,
  asOf: Date,
): ScenarioRun {
  const startDate = forecastStart(asOf);
  const period = trailingTwelveMonths(asOf);
  const recent = (propertyId: string) =>
    data.transactions.filter(
      (t: Transaction) =>
        t.propertyId === propertyId && t.date >= period.from && t.date <= period.to,
    );
  const loansOf = (propertyId: string | null) =>
    data.loans
      .filter((l) => l.propertyId === propertyId)
      .map((l) => applyLoanOverride(l, set.loanOverrides[l.id], startDate));

  const inputs = new Map<string, ForecastInput>();
  const byProperty = new Map<string, Record<ScenarioId, ForecastYear[]>>();
  for (const property of data.properties) {
    if (property.status !== 'owned') continue;
    const override = set.propertyOverrides[property.id];
    const units = data.units.filter((u) => u.propertyId === property.id);
    const unitIds = new Set(units.map((u) => u.id));
    const input: ForecastInput = {
      ...forecastInputFor({
        // A scenario indexation takes the place of the stored property default; leases with
        // their own indexation keep it.
        property:
          override?.rentIndexation != null
            ? { ...property, rentIndexation: override.rentIndexation }
            : property,
        units,
        leases: data.leases.filter((l) => unitIds.has(l.unitId)),
        trailingTransactions: recent(property.id),
        loans: loansOf(property.id),
        asOf,
      }),
      ...(override?.valueGrowth != null ? { valueGrowth: override.valueGrowth } : {}),
    };
    inputs.set(property.id, input);
    byProperty.set(
      property.id,
      byScenario((id) => forecast(input, set.scenarios[id])),
    );
  }

  // Portfolio-level loans: scopeData leaves them out of single-property views.
  const portfolioLoanList = loansOf(null);
  const portfolioInput: ForecastInput = {
    startDate,
    rentStreams: [],
    otherIncome: 0,
    operatingExpenses: 0,
    marketValue: 0,
    equityInvested: 0,
    loans: portfolioLoanList,
  };
  const portfolioLoans =
    portfolioLoanList.length > 0
      ? byScenario((id) => forecast(portfolioInput, set.scenarios[id]))
      : null;

  const total = byScenario((id) =>
    combineForecasts([
      ...[...byProperty.values()].map((f) => f[id]),
      ...(portfolioLoans ? [portfolioLoans[id]] : []),
    ]),
  );

  const allLoans = [...[...inputs.values()].flatMap((i) => i.loans), ...portfolioLoanList];
  const refinance = set.refinance.enabled
    ? byScenario((id) =>
        refinanceAfterForecast(
          allLoans,
          set.scenarios[id],
          set.refinance,
          startDate,
          total[id].at(-1)?.noi ?? 0,
        ),
      )
    : null;

  return { startDate, inputs, byProperty, portfolioLoans, total, refinance };
}
