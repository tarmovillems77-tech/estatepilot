import { describe, expect, it } from 'vitest';
import type { LoanInput } from '../types';
import { cumulativeFreeCashFlow, forecast, type ForecastInput, type Scenario } from './forecast';
import { refinanceAfterForecast } from './scenarioForecast';

/*
 * Every expected value below is worked out by hand from the formulas shown on the forecast
 * page, not with the engine. Round numbers keep the arithmetic checkable:
 *
 *   rent streams      30 000 € at 2% indexation, 20 000 € following the market (5%)
 *   vacancy           10%
 *   other income      1 000 €, grows with the market
 *   operating costs   8 000 € × (1 + 10%) adjustment, +4% a year
 *   maintenance       100 m² × 5 €/m², +4% a year from year 2
 *   capex reserve     5% of rental income
 *   value             500 000 €, −2% a year
 *   loan              0% fixed, 120 000 €, equal principal over 120 months → 12 000 € a year
 */

const scenario: Scenario = {
  rentGrowth: 0.05,
  vacancyRate: 0.1,
  opexAdjustment: 0.1,
  opexGrowth: 0.04,
  maintenanceReservePerM2: 5,
  valueGrowth: -0.02,
  capexReserveRate: 0.05,
  euribor3m: [0.02],
  euribor6m: [0.02],
  marginChange: 0,
};

const loan: LoanInput = {
  propertyId: 'p',
  lender: 'Näidispank AS',
  principal: 120_000,
  startDate: '2026-10-01',
  termMonths: 120,
  repaymentType: 'equal_principal',
  rateType: 'fixed',
  fixedRate: 0,
  dayCount: '30/360',
  actualBalance: null,
};

const input: ForecastInput = {
  startDate: '2026-11-01',
  rentStreams: [
    { annualRent: 30_000, indexation: 0.02 },
    { annualRent: 20_000, indexation: null },
  ],
  otherIncome: 1_000,
  operatingExpenses: 8_000,
  marketValue: 500_000,
  area: 100,
  totalInvestment: 400_000,
  equityInvested: 280_000,
  loans: [loan],
};

const years = forecast(input, scenario);
const [y1, y2] = years;

describe('forecast worked out by hand', () => {
  it('year 1: rents at today’s level, costs already grown one year', () => {
    // Potential rent 30 000 + 20 000 = 50 000; vacancy 5 000; other income 1 000.
    expect(y1!.grossPotentialRent).toBeCloseTo(50_000, 6);
    expect(y1!.vacancyLoss).toBeCloseTo(5_000, 6);
    expect(y1!.effectiveGrossIncome).toBeCloseTo(46_000, 6);
    // 8 000 × 1,1 × 1,04 = 9 152; maintenance 100 × 5 = 500.
    expect(y1!.operatingExpenses).toBeCloseTo(9_152, 6);
    expect(y1!.maintenanceReserve).toBeCloseTo(500, 6);
    // NOI = 46 000 − 9 152 − 500 = 36 348.
    expect(y1!.noi).toBeCloseTo(36_348, 6);
    // Payments 1.11.2026 … 1.10.2027 fall in year 1 (first payment one month after
    // 1.10.2026; year 1 = 1.11.2026–31.10.2027): 12 × 1 000 €.
    expect(y1!.principal).toBeCloseTo(12_000, 6);
    expect(y1!.interest).toBe(0);
    expect(y1!.loanBalance).toBeCloseTo(108_000, 6);
    // Capex 5% × 46 000 = 2 300; FCF = 36 348 − 12 000 − 2 300 = 22 048.
    expect(y1!.capexReserve).toBeCloseTo(2_300, 6);
    expect(y1!.freeCashFlow).toBeCloseTo(22_048, 6);
    expect(y1!.monthlyFreeCashFlow).toBeCloseTo(22_048 / 12, 6);
    // Value 500 000 × 0,98 = 490 000; equity 382 000; LTV 108 000 / 490 000.
    expect(y1!.propertyValue).toBeCloseTo(490_000, 6);
    expect(y1!.equity).toBeCloseTo(382_000, 6);
    expect(y1!.ltv).toBeCloseTo(108_000 / 490_000, 10);
    expect(y1!.dscr).toBeCloseTo(36_348 / 12_000, 10);
    expect(y1!.netYield).toBeCloseTo(36_348 / 400_000, 10);
  });

  it('year 2: each rent grows by its own rate', () => {
    // 30 000 × 1,02 + 20 000 × 1,05 = 30 600 + 21 000 = 51 600.
    expect(y2!.grossPotentialRent).toBeCloseTo(51_600, 6);
    expect(y2!.otherIncome).toBeCloseTo(1_050, 6);
    // 8 000 × 1,1 × 1,04² = 9 518,08; maintenance 500 × 1,04 = 520.
    expect(y2!.operatingExpenses).toBeCloseTo(9_518.08, 6);
    expect(y2!.maintenanceReserve).toBeCloseTo(520, 6);
    // Rental income 51 600 − 5 160 + 1 050 = 47 490; NOI 47 490 − 9 518,08 − 520.
    expect(y2!.noi).toBeCloseTo(37_451.92, 6);
    expect(y2!.principal).toBeCloseTo(12_000, 6);
    expect(y2!.loanBalance).toBeCloseTo(96_000, 6);
    expect(y2!.propertyValue).toBeCloseTo(480_200, 6);
  });

  it('builds equity only from value change and principal repayment', () => {
    for (const y of years) expect(y.equity).toBeCloseTo(y.propertyValue - y.loanBalance, 6);
    const cumulative = cumulativeFreeCashFlow(years);
    expect(cumulative[1]).toBeCloseTo(y1!.freeCashFlow + y2!.freeCashFlow, 6);
    // Equity grew by principal repaid minus value lost — not by the cash flow.
    expect(y2!.equity - y1!.equity).toBeCloseTo(12_000 - 9_800, 6);
  });

  it('refinances the year-5 balance on a new loan', () => {
    // Year 5 ends 31.10.2031; 60 payments through 1.10.2031 → balance 60 000.
    expect(years[4]!.loanBalance).toBeCloseTo(60_000, 6);
    const result = refinanceAfterForecast(
      [loan],
      { ...scenario, euribor6m: [0, 0, 0, 0, 0] },
      { enabled: true, margin: 0.03, euriborTenor: '6M', termYears: 10, feesPerLoan: 500 },
      '2026-11-01',
      years[4]!.noi,
    );
    expect(result.date).toBe('2031-11-01');
    expect(result.balance).toBeCloseTo(60_000, 6);
    expect(result.fees).toBe(500);
    // Current loan: 1 000 € principal a month at 0% → 12 000 € next year.
    expect(result.current.annualDebtService).toBeCloseTo(12_000, 6);
    // New loan keeps the repayment type (equal principal): 60 000 € at 3% over 120 months.
    // First payment 60 000 / 120 + 60 000 × 3% / 12 = 500 + 150 = 650 €.
    expect(result.refinanced.monthlyPayment).toBeCloseTo(650, 6);
    // Next 12 months: principal 6 000 + interest 0,25% × (12 × 60 000 − 500 × (0 + … + 11))
    // = 6 000 + 0,0025 × 687 000 = 7 717,50 €.
    expect(result.refinanced.annualDebtService).toBeCloseTo(7_717.5, 6);
    expect(result.refinanced.annualRate).toBeCloseTo(0.03, 10);
    expect(result.dscrRefinanced).toBeCloseTo(years[4]!.noi / 7_717.5, 10);
    expect(result.dscrCurrent).toBeCloseTo(years[4]!.noi / 12_000, 10);
  });
});
