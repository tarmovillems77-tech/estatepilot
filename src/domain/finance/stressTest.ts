import { addMonths, fromIsoDate, toIsoDate } from '../dates';
import { DSCR_THRESHOLD } from './dashboard';
import {
  combineForecasts,
  forecast,
  FORECAST_YEARS,
  scenarioSchedule,
  type ForecastInput,
  type ForecastYear,
  type Scenario,
} from './forecast';
import type { ScenarioRun } from './scenarioForecast';

/*
 * Interest rate stress test on top of the forecast engine.
 *
 * Each stress level sets the 3- and 6-month Euribor to one value:
 *   shock:      in forecast year 1 only, then back to the scenario's own path
 *   sustained:  in all five forecast years
 * Loans reprice only on their own reset dates (every 3 or 6 months from the loan start), so a
 * shock reaches each loan at its next reset. Everything else — actual balances, margins,
 * remaining terms, repayment types, loan overrides, rents and costs — comes from the forecast
 * run being stressed. Stored data is never touched.
 *
 * Reported per level, for the portfolio and each property:
 *   monthly payment   loan payments due in the 7th forecast month, after every 3M and 6M loan
 *                     has reset at least once
 *   shock:            year-1 debt service, DSCR, monthly free cash flow and LTV
 *   sustained:        worst year: highest debt service, lowest DSCR, lowest monthly free cash
 *                     flow, highest LTV
 *   both:             interest and free cash flow over the five years
 */

export type StressMode = 'shock' | 'sustained';
export const stressModes: readonly StressMode[] = ['shock', 'sustained'];

/** Predefined Euribor levels and the range a user may enter. */
export const STRESS_PRESETS = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08] as const;
export const STRESS_MIN = 0.01;
export const STRESS_MAX = 0.08;
export const LTV_LIMIT = 0.7;
/** Test case the stress section opens with: Euribor 4% + bank margin 2,65% = 6,65%. */
export const DEFAULT_STRESS_RATE = 0.04;
export const DEFAULT_STRESS_MARGIN = 0.0265;

/** Search range for break-even rates. */
const SEARCH_MAX = 0.2;

export function stressedScenario(scenario: Scenario, rate: number, mode: StressMode): Scenario {
  const path = (own: readonly number[]) =>
    Array.from({ length: FORECAST_YEARS }, (_, i) =>
      mode === 'sustained' || i === 0 ? rate : (own[Math.min(i, own.length - 1)] ?? rate),
    );
  return { ...scenario, euribor3m: path(scenario.euribor3m), euribor6m: path(scenario.euribor6m) };
}

export interface StressSummary {
  monthlyPayment: number;
  annualDebtService: number;
  dscr: number | null;
  monthlyFreeCashFlow: number;
  ltv: number | null;
  interestFiveYears: number;
  freeCashFlowFiveYears: number;
}

/** A forecast unit of the portfolio: one property or the portfolio-level loans. */
export interface StressUnit {
  /** Property id, or null for portfolio-level loans. */
  id: string | null;
  input: ForecastInput;
}

/**
 * Forecast units of a run. With `margin`, every variable-rate loan uses that bank margin from
 * the forecast start (applied on its next reset); fixed-rate loans are unaffected. The loans
 * are copies — stored loans keep their own margin.
 */
/** The parts of a forecast run the stress test needs (plain data, so it can go to a worker). */
export type StressSource = Pick<ScenarioRun, 'inputs' | 'portfolioInput'>;

export function stressUnits(run: StressSource, margin: number | null = null): StressUnit[] {
  const withMargin = (input: ForecastInput): ForecastInput =>
    margin === null
      ? input
      : {
          ...input,
          loans: input.loans.map((loan) =>
            loan.rateType === 'euribor' ? { ...loan, forecastMargin: margin } : loan,
          ),
        };
  return [
    ...[...run.inputs].map(([id, input]) => ({ id, input: withMargin(input) })),
    ...(run.portfolioInput.loans.length > 0
      ? [{ id: null, input: withMargin(run.portfolioInput) }]
      : []),
  ];
}

/** Payments due in the 7th forecast month (after every loan has reset at least once). */
function paymentAfterReset(input: ForecastInput, scenario: Scenario): number {
  const from = toIsoDate(addMonths(fromIsoDate(input.startDate), 6));
  const to = toIsoDate(addMonths(fromIsoDate(input.startDate), 7));
  return input.loans.reduce((sum, loan) => {
    const row = scenarioSchedule(loan, scenario, input.startDate).find(
      (r) => r.date >= from && r.date < to,
    );
    return sum + (row?.payment ?? 0);
  }, 0);
}

export function summarize(
  years: readonly ForecastYear[],
  mode: StressMode,
  monthlyPayment: number,
): StressSummary {
  const first = years[0];
  const dscrs = years.map((y) => y.dscr).filter((d): d is number => d !== null);
  const ltvs = years.map((y) => y.ltv).filter((l): l is number => l !== null);
  const fiveYears = {
    interestFiveYears: years.reduce((s, y) => s + y.interest, 0),
    freeCashFlowFiveYears: years.reduce((s, y) => s + y.freeCashFlow, 0),
  };
  if (mode === 'shock' || !first) {
    return {
      monthlyPayment,
      annualDebtService: first?.debtService ?? 0,
      dscr: first?.dscr ?? null,
      monthlyFreeCashFlow: first?.monthlyFreeCashFlow ?? 0,
      ltv: first?.ltv ?? null,
      ...fiveYears,
    };
  }
  return {
    monthlyPayment,
    annualDebtService: Math.max(...years.map((y) => y.debtService)),
    dscr: dscrs.length > 0 ? Math.min(...dscrs) : null,
    monthlyFreeCashFlow: Math.min(...years.map((y) => y.monthlyFreeCashFlow)),
    ltv: ltvs.length > 0 ? Math.max(...ltvs) : null,
    ...fiveYears,
  };
}

export interface StressPoint {
  rate: number;
  total: StressSummary;
  totalYears: ForecastYear[];
  /** Keyed by property id; portfolio-level loans under "portfolio". */
  units: Map<string, StressSummary>;
}

export const PORTFOLIO_LOANS_KEY = 'portfolio';

/** Runs one stress level against the units of a forecast run. */
export function stressPoint(
  units: readonly StressUnit[],
  scenario: Scenario,
  rate: number,
  mode: StressMode,
  /** Skip the monthly-payment figure (not needed when searching for break-even rates). */
  withPayments = true,
): StressPoint {
  return scenarioPoint(units, stressedScenario(scenario, rate, mode), mode, rate, withPayments);
}

/** The same figures for a scenario as it is (the unstressed comparison row). */
export function scenarioPoint(
  units: readonly StressUnit[],
  stressed: Scenario,
  mode: StressMode,
  rate = Number.NaN,
  withPayments = true,
): StressPoint {
  const results = units.map((unit) => ({
    unit,
    years: forecast(unit.input, stressed),
    payment: withPayments ? paymentAfterReset(unit.input, stressed) : 0,
  }));
  const totalYears = combineForecasts(results.map((r) => r.years));
  return {
    rate,
    totalYears,
    total: summarize(
      totalYears,
      mode,
      results.reduce((s, r) => s + r.payment, 0),
    ),
    units: new Map(
      results.map((r) => [r.unit.id ?? PORTFOLIO_LOANS_KEY, summarize(r.years, mode, r.payment)]),
    ),
  };
}

export type BreakEven =
  /** The limit is crossed at this Euribor. */
  | { kind: 'rate'; rate: number }
  /** Already below the limit even at 0% Euribor. */
  | { kind: 'always' }
  /** Not crossed up to the search maximum (or no loans). */
  | { kind: 'never'; upTo: number };

/**
 * Euribor at which a metric reaches its limit, by bisection (both metrics fall as rates rise).
 * DSCR: the rate where it falls to 1.20; cash flow: where monthly free cash flow reaches zero.
 */
export function breakEvenRate(
  units: readonly StressUnit[],
  scenario: Scenario,
  mode: StressMode,
  metric: 'dscr' | 'cashFlow',
): BreakEven {
  const margin = (rate: number) => {
    const total = stressPoint(units, scenario, rate, mode, false).total;
    if (metric === 'cashFlow') return total.monthlyFreeCashFlow;
    return total.dscr === null ? Infinity : total.dscr - DSCR_THRESHOLD;
  };
  if (margin(0) < 0) return { kind: 'always' };
  if (margin(SEARCH_MAX) >= 0) return { kind: 'never', upTo: SEARCH_MAX };
  let lo = 0;
  let hi = SEARCH_MAX;
  // 20 halvings of 0–20% → precision about 0,00002 percentage points.
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (margin(mid) >= 0) lo = mid;
    else hi = mid;
  }
  return { kind: 'rate', rate: (lo + hi) / 2 };
}
