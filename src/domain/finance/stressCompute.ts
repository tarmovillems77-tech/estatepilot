import type { Scenario } from './forecast';
import {
  breakEvenRate,
  PORTFOLIO_LOANS_KEY,
  scenarioPoint,
  STRESS_MIN,
  stressModes,
  stressPoint,
  stressUnits,
  type BreakEven,
  type StressMode,
  type StressPoint,
  type StressSource,
} from './stressTest';

/*
 * Everything the stress section shows, computed in one call from plain data so it can run in a
 * Web Worker (off the main thread) or directly.
 */

export interface StressRequest {
  source: StressSource;
  scenario: Scenario;
  mode: StressMode;
  rates: readonly number[];
  /** Bank margin for every variable loan; null = each loan's own margin. */
  margin: number | null;
}

export interface StressResult {
  points: StressPoint[];
  baseline: StressPoint;
  breakEven: { dscr: BreakEven; cash: BreakEven };
  perUnit: { key: string; id: string | null; dscr: BreakEven; cash: BreakEven }[];
  /** 1% … 8% in 0,5% steps for the charts: DSCR and monthly free cash flow per mode. */
  curve: {
    rate: number;
    dscr: Record<StressMode, number | null>;
    cash: Record<StressMode, number>;
  }[];
}

const CURVE_RATES = Array.from(
  { length: 15 },
  (_, i) => Math.round((STRESS_MIN + i * 0.005) * 1000) / 1000,
);

export function computeStress({
  source,
  scenario: own,
  mode,
  rates,
  margin,
}: StressRequest): StressResult {
  // An explicit stress margin replaces each loan's margin; the scenario's margin change is not
  // added on top of it.
  const scenario = margin === null ? own : { ...own, marginChange: 0 };
  const units = stressUnits(source, margin);

  return {
    points: rates.map((rate) => stressPoint(units, scenario, rate, mode)),
    baseline: scenarioPoint(units, scenario, mode),
    breakEven: {
      dscr: breakEvenRate(units, scenario, mode, 'dscr'),
      cash: breakEvenRate(units, scenario, mode, 'cashFlow'),
    },
    perUnit: units.map((unit) => ({
      key: unit.id ?? PORTFOLIO_LOANS_KEY,
      id: unit.id,
      // Portfolio-level loans have no income: break-even does not apply.
      dscr:
        unit.id === null
          ? { kind: 'never', upTo: 0 }
          : breakEvenRate([unit], scenario, mode, 'dscr'),
      cash:
        unit.id === null
          ? { kind: 'never', upTo: 0 }
          : breakEvenRate([unit], scenario, mode, 'cashFlow'),
    })),
    curve: CURVE_RATES.map((rate) => {
      const totals = stressModes.map(
        (m) => [m, stressPoint(units, scenario, rate, m, false).total] as const,
      );
      return {
        rate,
        dscr: Object.fromEntries(totals.map(([m, t]) => [m, t.dscr])) as Record<
          StressMode,
          number | null
        >,
        cash: Object.fromEntries(totals.map(([m, t]) => [m, t.monthlyFreeCashFlow])) as Record<
          StressMode,
          number
        >,
      };
    }),
  };
}
