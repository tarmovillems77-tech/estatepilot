import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import type { ForecastYear, Scenario } from '@/domain/finance/forecast';
import type { Performance } from '@/domain/finance/metrics';
import { formatCurrency, formatDate, formatMultiple, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

const c = et.calc;
const eur = (value: number) => formatCurrency(value, { whole: true });

/*
 * Shows how each figure is derived: every line lists its inputs, and every ratio its formula
 * with the actual numbers. Nothing here is computed differently from the finance engine.
 */

interface Line {
  label: string;
  amount: number;
  /** "subtract" lines are shown with a minus; "total" lines are emphasised. */
  kind?: 'subtract' | 'total';
  note?: string;
}

interface Ratio {
  label: string;
  formula: string;
  /** Numerator and denominator as shown to the user. */
  inputs: [string, string] | null;
  value: string | null;
}

export function TrailingBreakdown({ performance: p }: { performance: Performance }) {
  const lines: Line[] = [
    { label: c.rentalIncome, amount: p.rentalIncome },
    { label: c.otherIncome, amount: p.otherIncome },
    { label: c.grossIncome, amount: p.grossIncome, kind: 'total' },
    { label: c.operatingExpenses, amount: p.operatingExpenses, kind: 'subtract' },
    { label: c.noi, amount: p.noi, kind: 'total' },
    {
      label: c.debtService(eur(p.interest), eur(p.principalRepaid)),
      amount: p.debtService,
      kind: 'subtract',
    },
    { label: c.capex, amount: p.capex, kind: 'subtract' },
    {
      label: c.freeCashFlow,
      amount: p.freeCashFlow,
      kind: 'total',
      note: c.perMonth(eur(p.monthlyFreeCashFlow)),
    },
  ];

  const ratios: Ratio[] = [
    {
      label: c.grossYield,
      formula: c.grossYieldFormula,
      inputs: [eur(p.rentalIncome), eur(p.purchasePrice)],
      value: p.grossYield === null ? null : formatPercent(p.grossYield),
    },
    {
      label: c.netYield,
      formula: c.netYieldFormula,
      inputs: [eur(p.noi), eur(p.totalInvestment)],
      value: p.netYield === null ? null : formatPercent(p.netYield),
    },
    {
      label: c.netYieldOnValue,
      formula: c.netYieldOnValueFormula,
      inputs: [eur(p.noi), eur(p.marketValue)],
      value: p.netYieldOnValue === null ? null : formatPercent(p.netYieldOnValue),
    },
    {
      label: c.dscr,
      formula: c.dscrFormula,
      inputs: p.debtService > 0 ? [eur(p.noi), eur(p.debtService)] : null,
      value: p.dscr === null ? null : formatMultiple(p.dscr),
    },
    {
      label: c.ltv,
      formula: c.ltvFormula,
      inputs: [eur(p.loanBalance), eur(p.marketValue)],
      value: p.ltv === null ? null : formatPercent(p.ltv),
    },
  ];

  return <Breakdown intro={null} lines={lines} ratios={ratios} />;
}

export function TrailingIntro({ from, to }: { from: string; to: string }) {
  return <>{c.trailingIntro(formatDate(from), formatDate(to))}</>;
}

/** Estimate for a prospect from forecast year 1 of the base scenario. */
export function EstimateBreakdown({
  year,
  scenario,
  opexRatio,
  purchasePrice,
  totalInvestment,
  marketValue,
}: {
  year: ForecastYear;
  scenario: Scenario;
  /** Set when operating costs are an estimate rather than history. */
  opexRatio: number | null;
  purchasePrice: number;
  totalInvestment: number;
  marketValue: number;
}) {
  const lines: Line[] = [
    { label: c.potentialRent, amount: year.grossPotentialRent },
    {
      label: c.vacancy(formatPercent(scenario.vacancyRate, 0)),
      amount: year.vacancyLoss,
      kind: 'subtract',
    },
    { label: c.otherIncome, amount: year.otherIncome },
    { label: c.effectiveIncome, amount: year.effectiveGrossIncome, kind: 'total' },
    {
      label:
        opexRatio === null
          ? c.operatingExpenses
          : c.operatingExpensesEstimate(formatPercent(opexRatio, 0)),
      amount: year.operatingExpenses,
      kind: 'subtract',
    },
    { label: c.noi, amount: year.noi, kind: 'total' },
    {
      label: c.capexReserve(formatPercent(scenario.capexReserveRate, 0)),
      amount: year.capexReserve,
      kind: 'subtract',
    },
    {
      label: c.freeCashFlow,
      amount: year.freeCashFlow,
      kind: 'total',
      note: c.perMonth(eur(year.monthlyFreeCashFlow)),
    },
  ];

  const ratio = (a: number, b: number) => (b > 0 ? formatPercent(a / b) : null);
  const ratios: Ratio[] = [
    {
      label: c.grossYield,
      formula: c.grossYieldFormula,
      inputs: [eur(year.grossPotentialRent), eur(purchasePrice)],
      value: ratio(year.grossPotentialRent, purchasePrice),
    },
    {
      label: c.netYield,
      formula: c.netYieldFormula,
      inputs: [eur(year.noi), eur(totalInvestment)],
      value: ratio(year.noi, totalInvestment),
    },
    {
      label: c.netYieldOnValue,
      formula: c.netYieldOnValueFormula,
      inputs: [eur(year.noi), eur(marketValue)],
      value: ratio(year.noi, marketValue),
    },
  ];

  return <Breakdown intro={c.estimateIntro} lines={lines} ratios={ratios} />;
}

function Breakdown({
  intro,
  lines,
  ratios,
}: {
  intro: string | null;
  lines: Line[];
  ratios: Ratio[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        {intro && <p className="mb-3 text-sm text-slate-600">{intro}</p>}
        <dl className="text-sm">
          {lines.map((line) => (
            <div
              key={line.label}
              className={`flex items-baseline justify-between gap-4 py-1.5 ${
                line.kind === 'total'
                  ? 'border-t border-slate-200 font-semibold text-slate-900'
                  : 'text-slate-600'
              }`}
            >
              <dt>
                {line.kind === 'subtract' && '− '}
                {line.kind === 'total' && '= '}
                {line.label}
                {line.note && (
                  <span className="ml-2 text-xs font-normal text-slate-500">({line.note})</span>
                )}
              </dt>
              <dd className="tabular whitespace-nowrap">{eur(line.amount)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{c.ratiosTitle}</h3>
        <ul className="space-y-2 text-sm">
          {ratios.map((r) => (
            <li key={r.label} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium text-slate-900">{r.label}</span>
                <span className="tabular font-semibold text-slate-900">
                  {r.value ?? c.notApplicable}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                = {r.formula}
                {r.inputs && (
                  <span className="tabular">
                    {' '}
                    = {r.inputs[0]} / {r.inputs[1]}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CalculationCard({ intro, children }: { intro?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{c.title}</h2>
      {intro && <p className="mt-1 mb-4 text-sm text-slate-600">{intro}</p>}
      <div className={intro ? '' : 'mt-4'}>{children}</div>
      <p className="mt-5 text-xs text-slate-500">{c.footnote}</p>
    </Card>
  );
}
