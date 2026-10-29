import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo';
import type { LoanInput } from '../types';
import { DSCR_THRESHOLD, scopeData } from './dashboard';
import { defaultScenarios, forecastStart, scenarioSchedule } from './forecast';
import { balanceOn, amortizationSchedule } from './loan';
import { defaultScenarioSet, runScenarioSet } from './scenarioForecast';
import {
  breakEvenRate,
  PORTFOLIO_LOANS_KEY,
  STRESS_PRESETS,
  stressedScenario,
  stressPoint,
  stressUnits,
} from './stressTest';

const asOf = new Date(2026, 9, 29);
const demo = buildDemoData(asOf);
const set = defaultScenarioSet('Vaikimisi');
const run = runScenarioSet(demo, set, asOf);
const units = stressUnits(run);
const base = set.scenarios.base;
const byName = (prefix: string) => demo.properties.find((p) => p.name.startsWith(prefix))!;
const moisa = byName('Mõisa'); // fixed-rate loan
const parna = byName('Pärna'); // 6M loan with an actual balance

describe('stressedScenario', () => {
  it('sets year 1 only for a shock and every year when sustained', () => {
    const shock = stressedScenario(base, 0.06, 'shock');
    expect(shock.euribor3m).toEqual([0.06, ...base.euribor3m.slice(1)]);
    expect(shock.euribor6m).toEqual([0.06, ...base.euribor6m.slice(1)]);
    expect(stressedScenario(base, 0.06, 'sustained').euribor6m).toEqual([
      0.06, 0.06, 0.06, 0.06, 0.06,
    ]);
    // Everything else is left as it was.
    expect(shock.vacancyRate).toBe(base.vacancyRate);
  });
});

describe('reset schedule', () => {
  // A 6M loan started 15.05.2026 resets on 15.11.2026, 15.05.2027 …; the forecast starts 1.11.2026.
  const loan: LoanInput = {
    propertyId: 'p',
    lender: 'Näidispank AS',
    principal: 200_000,
    startDate: '2026-05-15',
    termMonths: 240,
    repaymentType: 'annuity',
    rateType: 'euribor',
    euriborTenor: '6M',
    margin: 0.02,
    euribor: 0.022,
    dayCount: '30/360',
    actualBalance: null,
  };

  it('reprices a loan only on its own reset date', () => {
    const rows = scenarioSchedule(loan, stressedScenario(base, 0.08, 'shock'), '2026-11-01');
    const payment = (date: string) => rows.find((r) => r.date === date)!;
    // 15.11.2026 payment still carries the rate fixed on 15.05.2026.
    expect(payment('2026-11-15').euribor).toBe(0.022);
    // The period starting 15.11.2026 is priced at the stress level.
    expect(payment('2026-12-15').euribor).toBe(0.08);
    // After year 1 the shock ends at the next reset (15.11.2027 period).
    expect(payment('2027-12-15').euribor).toBe(base.euribor6m[1]);
  });
});

describe('stressPoint on demo data', () => {
  const points = STRESS_PRESETS.map((rate) => stressPoint(units, base, rate, 'shock'));

  it('raises payments and lowers DSCR as Euribor rises', () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.total.monthlyPayment).toBeGreaterThan(points[i - 1]!.total.monthlyPayment);
      expect(points[i]!.total.annualDebtService).toBeGreaterThan(
        points[i - 1]!.total.annualDebtService,
      );
      expect(points[i]!.total.dscr!).toBeLessThan(points[i - 1]!.total.dscr!);
      expect(points[i]!.total.monthlyFreeCashFlow).toBeLessThan(
        points[i - 1]!.total.monthlyFreeCashFlow,
      );
    }
  });

  it('leaves the fixed-rate loan unchanged', () => {
    const low = points[0]!.units.get(moisa.id)!;
    const high = points.at(-1)!.units.get(moisa.id)!;
    expect(high.annualDebtService).toBeCloseTo(low.annualDebtService, 6);
    expect(high.monthlyPayment).toBeCloseTo(low.monthlyPayment, 6);
  });

  it('adds properties and portfolio-level loans up to the total', () => {
    const point = points[3]!;
    const sum = [...point.units.values()].reduce((s, u) => s + u.annualDebtService, 0);
    expect(point.total.annualDebtService).toBeCloseTo(sum, 6);
    expect(point.units.has(PORTFOLIO_LOANS_KEY)).toBe(true);
  });

  it('starts from the bank-confirmed balance of the Pärna loan', () => {
    const loan = demo.loans.find((l) => l.propertyId === parna.id)!;
    expect(loan.actualBalance).not.toBeNull();
    const start = forecastStart(asOf);
    const schedule = amortizationSchedule(loan);
    // Balance at the forecast start follows from the actual balance, whatever the stress level.
    const stressedRows = scenarioSchedule(loan, stressedScenario(base, 0.08, 'shock'), start);
    expect(balanceOn(loan, stressedRows, start)).toBeCloseTo(balanceOn(loan, schedule, start), 6);
  });

  it('does not change stored data', () => {
    const before = structuredClone(demo);
    stressPoint(units, base, 0.08, 'sustained');
    breakEvenRate(units, base, 'sustained', 'dscr');
    expect(demo).toEqual(before);
  });
});

describe('shock versus sustained', () => {
  it('agree in year 1 and diverge afterwards', () => {
    const shock = stressPoint(units, base, 0.06, 'shock');
    const sustained = stressPoint(units, base, 0.06, 'sustained');
    expect(sustained.totalYears[0]!.debtService).toBeCloseTo(shock.totalYears[0]!.debtService, 6);
    expect(sustained.totalYears[2]!.interest).toBeGreaterThan(shock.totalYears[2]!.interest);
    expect(sustained.total.interestFiveYears).toBeGreaterThan(shock.total.interestFiveYears);
    // Sustained reports the worst year.
    const dscrs = sustained.totalYears.map((y) => y.dscr!);
    expect(sustained.total.dscr).toBe(Math.min(...dscrs));
  });
});

describe('break-even Euribor', () => {
  for (const mode of ['shock', 'sustained'] as const) {
    it(`finds where DSCR falls to 1,20 and cash flow to zero (${mode})`, () => {
      const dscr = breakEvenRate(units, base, mode, 'dscr');
      const cash = breakEvenRate(units, base, mode, 'cashFlow');
      if (dscr.kind === 'rate') {
        expect(stressPoint(units, base, dscr.rate, mode).total.dscr!).toBeCloseTo(
          DSCR_THRESHOLD,
          4,
        );
      }
      if (cash.kind === 'rate') {
        expect(
          Math.abs(stressPoint(units, base, cash.rate, mode).total.monthlyFreeCashFlow),
        ).toBeLessThan(1);
      }
      expect(dscr.kind).not.toBe('never');
    });
  }

  it('reports "always" when coverage is too thin even at 0%', () => {
    const extra: LoanInput = { ...demo.loans[0]!, principal: 900_000, actualBalance: null };
    const stressedData = scopeData(
      { ...demo, loans: [...demo.loans, { ...demo.loans[0]!, ...extra, id: 'x' }] },
      parna.id,
    );
    const stressedUnits = stressUnits(runScenarioSet(stressedData, set, asOf));
    expect(breakEvenRate(stressedUnits, defaultScenarios.base, 'shock', 'dscr').kind).toBe(
      'always',
    );
  });

  it('reports "never" for a property without variable-rate debt', () => {
    const moisaUnits = stressUnits(runScenarioSet(scopeData(demo, moisa.id), set, asOf));
    const result = breakEvenRate(moisaUnits, base, 'shock', 'cashFlow');
    expect(result.kind).not.toBe('rate');
  });
});

describe('test case: Euribor 4% + bank margin 2,65% = 6,65%', () => {
  const RATE = 0.04;
  const MARGIN = 0.0265;
  const stressUnitsWithMargin = stressUnits(run, MARGIN);
  // An explicit margin replaces each loan's own; the scenario's margin change is not added.
  const scenario = { ...base, marginChange: 0 };
  const sustained = stressedScenario(scenario, RATE, 'sustained');
  const start = run.startDate;

  it('prices every variable loan at 6,65% from its first reset and leaves fixed loans alone', () => {
    for (const unit of stressUnitsWithMargin) {
      for (const loan of unit.input.loans) {
        const rows = scenarioSchedule(loan, sustained, start).filter((r) => r.date >= start);
        if (loan.rateType === 'fixed') {
          expect(rows.every((r) => r.annualRate === loan.fixedRate)).toBe(true);
          continue;
        }
        // Rows after the first reset in the forecast (at most 6 months in) carry 4% + 2,65%.
        const later = rows.filter((r) => r.date >= '2027-06-01');
        expect(later.every((r) => Math.abs(r.annualRate - 0.0665) < 1e-12)).toBe(true);
        expect(later.every((r) => r.euribor === RATE && r.margin === MARGIN)).toBe(true);
      }
    }
  });

  it('matches the annuity formula for the 6M annuity loan after its reset', () => {
    const unit = stressUnitsWithMargin.find((u) => u.id === parna.id)!;
    const loan = unit.input.loans[0]!;
    const rows = scenarioSchedule(loan, sustained, start);
    const resetIndex = rows.findIndex((r) => r.date >= start && r.annualRate > 0.066);
    const opening = rows[resetIndex - 1]!.balance;
    const remaining = rows.length - resetIndex;
    const r = 0.0665 / 12;
    const formula = (opening * r) / (1 - (1 + r) ** -remaining);
    // With act/360 the payment stays at the annuity amount; only its interest/principal split varies.
    expect(rows[resetIndex]!.payment).toBeCloseTo(formula, 6);
    expect(rows[resetIndex + 1]!.payment).toBeCloseTo(formula, 6);
  });

  it('matches the hand calculation for the 3M equal-principal loan', () => {
    const unit = stressUnitsWithMargin.find((u) => u.id === byName('Tähe').id)!;
    const loan = unit.input.loans[0]!;
    const rows = scenarioSchedule(loan, sustained, start);
    const i = rows.findIndex((r) => r.date >= start && r.annualRate > 0.066);
    const opening = rows[i - 1]!.balance;
    // 30/360: interest = balance × 6,65% / 12; principal unchanged (original principal / term).
    expect(rows[i]!.interest).toBeCloseTo((opening * 0.0665) / 12, 6);
    expect(rows[i]!.principal).toBeCloseTo(loan.principal / loan.termMonths, 6);
  });

  it('derives DSCR, LTV and free cash flow from their parts', () => {
    const point = stressPoint(stressUnitsWithMargin, scenario, RATE, 'sustained');
    for (const y of point.totalYears) {
      expect(y.debtService).toBeCloseTo(y.interest + y.principal, 6);
      expect(y.dscr).toBeCloseTo(y.noi / y.debtService, 10);
      expect(y.ltv).toBeCloseTo(y.loanBalance / y.propertyValue, 10);
      expect(y.freeCashFlow).toBeCloseTo(y.noi - y.debtService - y.capexReserve, 6);
      expect(y.monthlyFreeCashFlow).toBeCloseTo(y.freeCashFlow / 12, 6);
    }
    // Sustained reports the worst year.
    expect(point.total.dscr).toBe(Math.min(...point.totalYears.map((y) => y.dscr!)));
    // A higher margin costs more than each loan's own margin at the same Euribor.
    const ownMargin = stressPoint(units, scenario, RATE, 'sustained');
    expect(point.total.interestFiveYears).toBeGreaterThan(ownMargin.total.interestFiveYears);
  });

  it('does not change the stored margins', () => {
    const margins = demo.loans.map((l) => (l.rateType === 'euribor' ? l.margin : null));
    stressPoint(stressUnitsWithMargin, scenario, RATE, 'shock');
    expect(demo.loans.map((l) => (l.rateType === 'euribor' ? l.margin : null))).toEqual(margins);
  });
});
