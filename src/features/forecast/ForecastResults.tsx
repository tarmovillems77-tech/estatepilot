import { memo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { ValueInput } from '@/components/ui/ValueInput';
import { DSCR_THRESHOLD } from '@/domain/finance/dashboard';
import {
  cumulativeFreeCashFlow,
  type ForecastYear,
  type ScenarioId,
} from '@/domain/finance/forecast';
import type { RefinanceOutcome, ScenarioRun } from '@/domain/finance/scenarioForecast';
import { euriborTenors } from '@/domain/schemas';
import type { ScenarioSetInput } from '@/domain/types';
import { formatCurrency, formatDate, formatMultiple, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';
import { metricKeys, scenarioColor, scenarioOrder, type MetricKey } from './metrics';
import { YearLinesChart } from './YearLinesChart';

const f = et.forecast;
const scenarioLabel = et.dashboard.charts.scenario;
const eur = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-600 focus:outline-none';

export const ScenarioKpis = memo(function ScenarioKpis({ run }: { run: ScenarioRun }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {scenarioOrder.map((id) => {
        const last = run.total[id].at(-1);
        if (!last) return null;
        const low = last.dscr !== null && last.dscr < DSCR_THRESHOLD;
        const rows: [string, string, boolean?][] = [
          [f.kpi.noi, eur(last.noi)],
          [f.kpi.fcfMonthly, eur(last.monthlyFreeCashFlow), last.monthlyFreeCashFlow < 0],
          [f.kpi.dscr, last.dscr === null ? dash : formatMultiple(last.dscr), low],
          [f.kpi.ltv, last.ltv === null ? dash : formatPercent(last.ltv)],
          [f.kpi.equity, eur(last.equity)],
          [f.kpi.netYield, last.netYield === null ? dash : formatPercent(last.netYield)],
        ];
        return (
          <Card key={id}>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: scenarioColor[id] }}
                aria-hidden="true"
              />
              <h3 className="font-semibold text-slate-900">{scenarioLabel[id]}</h3>
            </div>
            <p className="text-xs text-slate-500">
              {f.kpiTitle(last.year)} · {formatDate(last.to)}
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              {rows.map(([label, value, warn]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd
                    className={`tabular font-semibold ${warn ? 'text-amber-700' : 'text-slate-900'}`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        );
      })}
    </div>
  );
});

export const ScenarioComparisonChart = memo(function ScenarioComparisonChart({
  run,
}: {
  run: ScenarioRun;
}) {
  const [metric, setMetric] = useState<MetricKey>('freeCashFlow');
  return (
    <YearLinesChart
      title={f.compareTitle}
      description={f.compareDescription}
      metric={metric}
      series={scenarioOrder.map((id) => ({
        key: id,
        label: scenarioLabel[id],
        color: scenarioColor[id],
        years: run.total[id],
      }))}
      controls={
        <label className="flex items-center gap-2 text-sm text-slate-600">
          {f.metric}
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className={selectClass}
          >
            {metricKeys.map((key) => (
              <option key={key} value={key}>
                {f.metrics[key]}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
});

type RowKey = keyof typeof f.rows;
const rowFormat = (key: RowKey) =>
  key === 'ltv' || key === 'netYield' || key === 'euribor3m' || key === 'euribor6m'
    ? 'percent'
    : key === 'dscr'
      ? 'multiple'
      : 'eur';
const strongRows: RowKey[] = [
  'effectiveGrossIncome',
  'noi',
  'debtService',
  'freeCashFlow',
  'equity',
];

export const AnnualTable = memo(function AnnualTable({ run }: { run: ScenarioRun }) {
  const [scenario, setScenario] = useState<ScenarioId>('base');
  const years = run.total[scenario];
  const cumulative = cumulativeFreeCashFlow(years);
  const value = (year: ForecastYear, index: number, key: RowKey): number | null =>
    key === 'cumulativeFreeCashFlow' ? (cumulative[index] ?? 0) : year[key];
  const format = (key: RowKey, v: number | null) => {
    if (v === null) return dash;
    const kind = rowFormat(key);
    if (kind === 'percent') return formatPercent(v, key.startsWith('euribor') ? 2 : 1);
    if (kind === 'multiple') return formatMultiple(v);
    return eur(v);
  };
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <Card flush>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{f.tableTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{f.tableDescription}</p>
        </div>
        <div className="flex gap-1" role="tablist" aria-label={f.tableTitle}>
          {scenarioOrder.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scenario === id}
              className={tab(scenario === id)}
              onClick={() => setScenario(id)}
            >
              {scenarioLabel[id]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{f.rowColumn}</th>
              {years.map((y) => (
                <th key={y.year} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {f.yearColumn(y.year, formatDate(y.to))}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">{f.formulaColumn}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(Object.keys(f.rows) as RowKey[]).map((key) => {
              const [label, formula] = f.rows[key];
              const strong = strongRows.includes(key);
              return (
                <tr key={key} className={strong ? 'bg-slate-50/60' : ''}>
                  <th
                    scope="row"
                    className={`px-3 py-1.5 text-left whitespace-nowrap ${strong ? 'font-semibold text-slate-900' : 'font-normal text-slate-700'}`}
                  >
                    {label}
                  </th>
                  {years.map((y, i) => {
                    const v = value(y, i, key);
                    const warn =
                      (key === 'dscr' && v !== null && v < DSCR_THRESHOLD) ||
                      ((key === 'freeCashFlow' || key === 'monthlyFreeCashFlow') &&
                        v !== null &&
                        v < 0);
                    return (
                      <td
                        key={y.year}
                        className={`tabular px-3 py-1.5 text-right whitespace-nowrap ${strong ? 'font-semibold' : ''} ${warn ? 'text-amber-700' : ''}`}
                      >
                        {format(key, v)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-xs text-slate-500">{formula}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
});

export function RefinanceSection({
  set,
  onChange,
  run,
}: {
  set: ScenarioSetInput;
  onChange: (set: ScenarioSetInput) => void;
  run: ScenarioRun;
}) {
  const r = set.refinance;
  const update = (changes: Partial<ScenarioSetInput['refinance']>) =>
    onChange({ ...set, refinance: { ...r, ...changes } });
  const date = run.total.base.at(-1)?.to;
  const label = 'block text-sm font-medium text-slate-700';

  const rows: [string, (o: RefinanceOutcome, after: boolean) => string][] = [
    [f.refinanceRows.balance, (o) => eur(o.balance)],
    [f.refinanceRows.fees, (o, after) => (after ? eur(o.fees) : dash)],
    [
      f.refinanceRows.rate,
      (o, after) => formatPercent((after ? o.refinanced : o.current).annualRate, 2),
    ],
    [
      f.refinanceRows.monthlyPayment,
      (o, after) => eur((after ? o.refinanced : o.current).monthlyPayment),
    ],
    [
      f.refinanceRows.annualDebtService,
      (o, after) => eur((after ? o.refinanced : o.current).annualDebtService),
    ],
    [
      f.refinanceRows.interestFiveYears,
      (o, after) => eur((after ? o.refinanced : o.current).interestFiveYears),
    ],
    [
      f.refinanceRows.dscr,
      (o, after) => {
        const v = after ? o.dscrRefinanced : o.dscrCurrent;
        return v === null ? dash : formatMultiple(v);
      },
    ],
  ];

  return (
    <Card flush>
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">{f.refinanceTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {f.refinanceIntro(date ? formatDate(date) : dash)}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="accent-brand-700 size-4"
            />
            {f.refinanceFields.enabled}
          </label>
          <div className={label}>
            {f.refinanceFields.margin}
            <ValueInput
              label={f.refinanceFields.margin}
              value={r.margin}
              kind="percent"
              min={0}
              max={0.2}
              suffix="%"
              className="mt-1 w-full"
              onChange={(v) => v !== null && update({ margin: v })}
            />
          </div>
          <label className={label}>
            {f.refinanceFields.euriborTenor}
            <select
              value={r.euriborTenor}
              onChange={(e) => update({ euriborTenor: e.target.value as typeof r.euriborTenor })}
              className={`${selectClass} mt-1 w-full`}
            >
              {euriborTenors.map((t) => (
                <option key={t} value={t}>
                  {et.labels.euriborTenor[t]}
                </option>
              ))}
            </select>
          </label>
          <div className={label}>
            {f.refinanceFields.termYears}
            <ValueInput
              label={f.refinanceFields.termYears}
              value={r.termYears}
              kind="integer"
              min={1}
              max={50}
              suffix="a"
              className="mt-1 w-full"
              onChange={(v) => v !== null && update({ termYears: v })}
            />
          </div>
          <div className={label}>
            {f.refinanceFields.feesPerLoan}
            <ValueInput
              label={f.refinanceFields.feesPerLoan}
              value={r.feesPerLoan}
              min={0}
              max={1_000_000}
              suffix="€"
              className="mt-1 w-full"
              onChange={(v) => v !== null && update({ feesPerLoan: v })}
            />
          </div>
        </div>
      </div>

      {run.refinance ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left font-medium">
                  {f.rowColumn}
                </th>
                {scenarioOrder.map((id) => (
                  <th
                    key={id}
                    colSpan={2}
                    className="px-3 pt-2 text-center font-semibold text-slate-700"
                  >
                    {scenarioLabel[id]}
                  </th>
                ))}
              </tr>
              <tr>
                {scenarioOrder.flatMap((id) => [
                  <th key={`${id}-b`} className="px-3 pb-2 text-right font-medium">
                    {f.refinanceBefore}
                  </th>,
                  <th key={`${id}-a`} className="px-3 pb-2 text-right font-medium">
                    {f.refinanceAfter}
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([title, cell]) => (
                <tr key={title}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-slate-700">
                    {title}
                  </th>
                  {scenarioOrder.flatMap((id) => {
                    const outcome = run.refinance![id];
                    return [
                      <td key={`${id}-b`} className="tabular px-3 py-1.5 text-right">
                        {cell(outcome, false)}
                      </td>,
                      <td key={`${id}-a`} className="tabular px-3 py-1.5 text-right font-medium">
                        {cell(outcome, true)}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-500">{f.refinanceOff}</p>
      )}
      <div className="h-4" />
    </Card>
  );
}
