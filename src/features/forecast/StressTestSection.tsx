import { TriangleAlert } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { niceScale } from '@/components/charts/scale';
import { axisProps, CHART_HEIGHT, chrome, series, status } from '@/components/charts/theme';
import { Card } from '@/components/ui/Card';
import { ValueInput } from '@/components/ui/ValueInput';
import { DSCR_THRESHOLD } from '@/domain/finance/dashboard';
import type { ScenarioId } from '@/domain/finance/forecast';
import type { ScenarioRun } from '@/domain/finance/scenarioForecast';
import type { StressRequest } from '@/domain/finance/stressCompute';
import {
  LTV_LIMIT,
  STRESS_MAX,
  STRESS_MIN,
  STRESS_PRESETS,
  DEFAULT_STRESS_MARGIN,
  DEFAULT_STRESS_RATE,
  stressModes,
  type BreakEven,
  type StressMode,
  type StressSummary,
} from '@/domain/finance/stressTest';
import type { ScenarioSetInput } from '@/domain/types';
import {
  formatCompactCurrency,
  formatCurrency,
  formatMultiple,
  formatNumber,
  formatPercent,
} from '@/i18n/format';
import { et } from '@/i18n/et';
import { scenarioOrder } from './metrics';
import { useStressTest } from './useStressTest';

const s = et.forecast.stress;
const eur = (value: number) => formatCurrency(value, { whole: true });
const pct = (rate: number) => formatPercent(rate, rate * 100 === Math.round(rate * 100) ? 0 : 1);
const dash = '—';
const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-600 focus:outline-none';
const modeColor: Record<StressMode, string> = { shock: series[1], sustained: series[2] };

/**
 * A value that crosses a limit: amber text with an icon and a screen-reader label. The wrapper
 * is positioned so the sr-only label cannot escape the table's scroll area.
 */
function Flagged({ warn, label, children }: { warn: boolean; label: string; children: string }) {
  if (!warn) return <>{children}</>;
  return (
    <span className="relative inline-flex items-center gap-1 font-semibold text-amber-700">
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      {children}
      <span className="sr-only"> ({label})</span>
    </span>
  );
}

function breakEvenText(result: BreakEven) {
  if (result.kind === 'rate') return s.breakEven.rate(formatPercent(result.rate, 2));
  if (result.kind === 'always') return s.breakEven.always;
  return s.breakEven.never(pct(result.upTo));
}

export const StressTestSection = memo(function StressTestSection({
  run,
  set,
  unitName,
}: {
  run: ScenarioRun;
  set: ScenarioSetInput;
  unitName: (propertyId: string | null) => string;
}) {
  const [mode, setMode] = useState<StressMode>('shock');
  const [scenarioId, setScenarioId] = useState<ScenarioId>('base');
  // Default test case: Euribor 4% + bank margin 2,65% = 6,65%.
  const [custom, setCustom] = useState<number | null>(DEFAULT_STRESS_RATE);
  const [margin, setMargin] = useState<number | null>(DEFAULT_STRESS_MARGIN);
  const [selected, setSelected] = useState<number>(DEFAULT_STRESS_RATE);

  // The stress test runs in a Web Worker; the request changes only when an input does.
  const request = useMemo<StressRequest>(
    () => ({
      source: { inputs: run.inputs, portfolioInput: run.portfolioInput },
      scenario: set.scenarios[scenarioId],
      mode,
      rates: [...new Set([...STRESS_PRESETS, ...(custom === null ? [] : [custom])])].sort(
        (a, b) => a - b,
      ),
      margin,
    }),
    [run, set, scenarioId, mode, custom, margin],
  );
  const { result: results, stale } = useStressTest(request);
  const chartData = useMemo(
    () =>
      (results?.curve ?? []).map((p) => ({
        label: pct(p.rate),
        ...Object.fromEntries(
          stressModes.flatMap((m) => [
            [`dscr-${m}`, p.dscr[m]],
            [`cash-${m}`, p.cash[m]],
          ]),
        ),
      })),
    [results],
  );
  const rates = request.rates;

  const selectedPoint = results
    ? (results.points.find((p) => p.rate === selected) ??
      results.points[results.points.length - 1]!)
    : null;
  const view = results && selectedPoint ? { r: results, p: selectedPoint } : null;
  const c = s.columns;
  const th = 'px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-500';
  const td = 'tabular px-3 py-1.5 text-right whitespace-nowrap';
  /** `debtOnly`: portfolio-level loans have no income or value, so DSCR and LTV do not apply. */
  const cells = (summary: StressSummary, debtOnly = false) => [
    <td key="pay" className={td}>
      {eur(summary.monthlyPayment)}
    </td>,
    <td key="ds" className={td}>
      {eur(summary.annualDebtService)}
    </td>,
    <td key="dscr" className={td}>
      <Flagged
        warn={!debtOnly && summary.dscr !== null && summary.dscr < DSCR_THRESHOLD}
        label={s.flags.dscr}
      >
        {debtOnly || summary.dscr === null ? dash : formatMultiple(summary.dscr)}
      </Flagged>
    </td>,
    <td key="cash" className={td}>
      <Flagged warn={summary.monthlyFreeCashFlow < 0} label={s.flags.cash}>
        {eur(summary.monthlyFreeCashFlow)}
      </Flagged>
    </td>,
    <td key="ltv" className={td}>
      <Flagged
        warn={!debtOnly && summary.ltv !== null && summary.ltv > LTV_LIMIT}
        label={s.flags.ltv}
      >
        {debtOnly || summary.ltv === null ? dash : formatPercent(summary.ltv)}
      </Flagged>
    </td>,
  ];

  return (
    <section
      aria-labelledby="stress-title"
      aria-busy={stale}
      className={`space-y-4 transition-opacity ${stale ? 'opacity-60' : ''}`}
    >
      <Card className="space-y-4">
        <div>
          <h2 id="stress-title" className="text-lg font-semibold text-slate-900">
            {s.title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{s.intro}</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">{s.mode}</legend>
            <div className="flex flex-wrap gap-3">
              {stressModes.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="stress-mode"
                    className="accent-brand-700"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {s.modes[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-medium text-slate-700">
            <span className="mb-1 block">{s.operating}</span>
            <select
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value as ScenarioId)}
              className={selectClass}
            >
              {scenarioOrder.map((id) => (
                <option key={id} value={id}>
                  {et.dashboard.charts.scenario[id]}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm font-medium text-slate-700">
            <span className="mb-1 block">{s.margin}</span>
            <ValueInput
              label={s.margin}
              value={margin}
              kind="percent"
              allowEmpty
              min={0}
              max={0.2}
              suffix="%"
              className="w-28"
              onChange={setMargin}
            />
          </div>
          <div className="text-sm font-medium text-slate-700">
            <span className="mb-1 block">{s.custom}</span>
            <ValueInput
              label={s.custom}
              value={custom}
              kind="percent"
              allowEmpty
              min={STRESS_MIN}
              max={STRESS_MAX}
              suffix="%"
              className="w-28"
              onChange={setCustom}
            />
          </div>
        </div>
        <div className="space-y-1 text-xs text-slate-500">
          <p>{s.modeHelp[mode]}</p>
          <p>{margin === null ? s.marginHelp.own : s.marginHelp.fixed}</p>
          {custom !== null && margin !== null && (
            <p className="text-sm font-medium text-slate-700">
              {s.totalRate(
                pct(custom),
                formatPercent(margin, 2),
                formatPercent(custom + margin, 2),
              )}
            </p>
          )}
        </div>

        {view && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  [s.breakEvenDscr, view.r.breakEven.dscr],
                  [s.breakEvenCash, view.r.breakEven.cash],
                ] as const
              ).map(([label, result]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                    {s.breakEvenTitle}
                  </p>
                  <p className="text-sm text-slate-700">{label}</p>
                  <p className="tabular mt-1 text-lg font-semibold text-slate-900">
                    {breakEvenText(result)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      {view ? (
        <>
          <Card flush>
            <div className="px-5 pt-5">
              <h3 className="font-semibold text-slate-900">{s.tableTitle}</h3>
              <p className="text-sm text-slate-500">{s.tableDescription}</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50">
                  <tr>
                    <th className={`${th} text-left`}>{c.rate}</th>
                    <th className={`${th} text-right`}>{c.monthlyPayment}</th>
                    <th className={`${th} text-right`}>{c.annualDebtService}</th>
                    <th className={`${th} text-right`}>{c.dscr}</th>
                    <th className={`${th} text-right`}>{c.monthlyFreeCashFlow}</th>
                    <th className={`${th} text-right`}>{c.ltv}</th>
                    <th className={`${th} text-right`}>{c.interestFiveYears}</th>
                    <th className={`${th} text-right`}>{c.freeCashFlowFiveYears}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/60 text-slate-600">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      {s.baseline}
                    </th>
                    {cells(view.r.baseline.total)}
                    <td className={td}>{eur(view.r.baseline.total.interestFiveYears)}</td>
                    <td className={td}>{eur(view.r.baseline.total.freeCashFlowFiveYears)}</td>
                  </tr>
                  {view.r.points.map((point) => (
                    <tr key={point.rate} className={point.rate === custom ? 'bg-brand-50/60' : ''}>
                      <th
                        scope="row"
                        className="px-3 py-1.5 text-left font-semibold text-slate-900"
                      >
                        {pct(point.rate)}
                      </th>
                      {cells(point.total)}
                      <td className={td}>{eur(point.total.interestFiveYears)}</td>
                      <td className={td}>
                        <Flagged warn={point.total.freeCashFlowFiveYears < 0} label={s.flags.cash}>
                          {eur(point.total.freeCashFlowFiveYears)}
                        </Flagged>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-3" />
          </Card>

          <Card flush>
            <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
              <h3 className="font-semibold text-slate-900">{s.propertyTitle}</h3>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                {s.selectedRate}
                <select
                  value={view.p.rate}
                  onChange={(e) => setSelected(Number(e.target.value))}
                  className={selectClass}
                >
                  {rates.map((rate) => (
                    <option key={rate} value={rate}>
                      {pct(rate)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50">
                  <tr>
                    <th className={`${th} text-left`}>{c.unit}</th>
                    <th className={`${th} text-right`}>{c.monthlyPayment}</th>
                    <th className={`${th} text-right`}>{c.annualDebtService}</th>
                    <th className={`${th} text-right`}>{c.dscr}</th>
                    <th className={`${th} text-right`}>{c.monthlyFreeCashFlow}</th>
                    <th className={`${th} text-right`}>{c.ltv}</th>
                    <th className={`${th} text-right`}>{c.breakEvenDscr}</th>
                    <th className={`${th} text-right`}>{c.breakEvenCash}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {view.r.perUnit.map((unit) => {
                    const summary = view.p.units.get(unit.key);
                    if (!summary) return null;
                    const be = (r: BreakEven) =>
                      r.kind === 'rate'
                        ? formatPercent(r.rate, 2)
                        : r.kind === 'always'
                          ? '0%'
                          : `> ${pct(r.upTo)}`;
                    return (
                      <tr key={unit.key}>
                        <th
                          scope="row"
                          className="px-3 py-1.5 text-left font-medium text-slate-900"
                        >
                          {unit.id === null ? s.portfolioLoans : unitName(unit.id)}
                        </th>
                        {cells(summary, unit.id === null)}
                        <td className={td}>{unit.id === null ? dash : be(unit.dscr)}</td>
                        <td className={td}>{unit.id === null ? dash : be(unit.cash)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <th scope="row" className="px-3 py-1.5 text-left text-slate-900">
                      {s.total}
                    </th>
                    {cells(view.p.total)}
                    <td className={td}>
                      {view.r.breakEven.dscr.kind === 'rate'
                        ? formatPercent(view.r.breakEven.dscr.rate, 2)
                        : dash}
                    </td>
                    <td className={td}>
                      {view.r.breakEven.cash.kind === 'rate'
                        ? formatPercent(view.r.breakEven.cash.rate, 2)
                        : dash}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="h-3" />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <StressChart
              title={s.dscrChart.title}
              description={s.dscrChart.description}
              data={chartData}
              metric="dscr"
              format={formatMultiple}
              axisFormat={(v) => formatNumber(v, 1)}
              reference={{
                value: DSCR_THRESHOLD,
                label: et.dashboard.charts.dscr.threshold,
                color: status.critical,
              }}
            />
            <StressChart
              title={s.cashChart.title}
              description={s.cashChart.description}
              data={chartData}
              metric="cash"
              format={eur}
              axisFormat={formatCompactCurrency}
              reference={{ value: 0, label: s.zero, color: chrome.axis }}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      )}
    </section>
  );
});

function StressChart({
  title,
  description,
  data,
  metric,
  format,
  axisFormat,
  reference,
}: {
  title: string;
  description: string;
  data: Record<string, number | string | null>[];
  metric: 'dscr' | 'cash';
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  reference: { value: number; label: string; color: string };
}) {
  const lines = stressModes.map((m) => ({
    key: `${metric}-${m}`,
    label: s.modes[m],
    color: modeColor[m],
  }));
  const values = data.flatMap((d) =>
    lines.map((l) => d[l.key]).filter((v): v is number => typeof v === 'number'),
  );
  const scale = metric === 'dscr' ? niceScale(values, 0.1, reference.value) : null;

  return (
    <ChartCard
      title={title}
      description={description}
      legend={[
        ...lines.map((l) => ({ label: l.label, color: l.color, shape: 'line' as const })),
        ...(metric === 'dscr'
          ? [{ label: reference.label, color: reference.color, shape: 'threshold' as const }]
          : []),
      ]}
      table={{
        columns: [s.columns.rate, ...lines.map((l) => l.label)],
        rows: data.map((d) => ({
          key: String(d.label),
          cells: [
            String(d.label),
            ...lines.map((l) => (typeof d[l.key] === 'number' ? format(d[l.key] as number) : dash)),
          ],
        })),
      }}
    >
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke={chrome.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
            <YAxis
              {...axisProps}
              axisLine={false}
              width={72}
              tickFormatter={axisFormat}
              {...(scale ? { domain: scale.domain, ticks: scale.ticks } : {})}
            />
            <ReferenceLine
              y={reference.value}
              stroke={reference.color}
              strokeDasharray={metric === 'dscr' ? '4 4' : undefined}
            />
            <Tooltip
              cursor={{ stroke: chrome.muted, strokeWidth: 1 }}
              content={(props) => (
                <ChartTooltip
                  {...props}
                  series={lines}
                  formatValue={format}
                  formatLabel={(label) => `${s.columns.rate} ${label}`}
                />
              )}
            />
            {lines.map((l) => (
              <Line
                key={l.key}
                dataKey={l.key}
                name={l.label}
                type="linear"
                stroke={l.color}
                strokeWidth={2}
                dot={{ r: 3, fill: l.color, stroke: chrome.surface, strokeWidth: 1 }}
                activeDot={{ r: 5, fill: l.color, stroke: chrome.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
