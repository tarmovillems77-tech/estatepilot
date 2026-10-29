import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, type LegendItem } from '@/components/charts/ChartCard';
import { ChartTooltip, type TooltipSeries } from '@/components/charts/ChartTooltip';
import { axisProps, CHART_HEIGHT, chrome, series, status } from '@/components/charts/theme';
import type { CashFlowPoint, ProjectionPoint } from '@/domain/finance/dashboard';
import { DSCR_THRESHOLD } from '@/domain/finance/dashboard';
import type { ScenarioId } from '@/domain/finance/forecast';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatMonth,
  formatMonthShort,
  formatMultiple,
  formatNumber,
  formatPercent,
} from '@/i18n/format';
import { et } from '@/i18n/et';

/*
 * Dashboard charts. Every figure comes from the series computed in domain/finance/dashboard.ts;
 * each chart has one value axis, a legend (for 2+ series) and a table view.
 */

const c = et.dashboard.charts;
const eur = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';

/** Scenario colours follow the scenario everywhere: base first. */
const scenarioSeries: readonly { id: ScenarioId; color: string }[] = [
  { id: 'base', color: series[1] },
  { id: 'pessimistic', color: series[2] },
  { id: 'optimistic', color: series[3] },
];

const gridProps = { vertical: false, stroke: chrome.grid } as const;
/** Straight segments: smoothing would invent values between the data points. */
const lineProps = (color: string) =>
  ({
    type: 'linear',
    stroke: color,
    strokeWidth: 2,
    dot: { r: 3, fill: color, stroke: chrome.surface, strokeWidth: 1 },
    activeDot: { r: 5, fill: color, stroke: chrome.surface, strokeWidth: 2 },
    isAnimationActive: false,
  }) as const;

/** Domain and ticks on round steps, always including `include` (e.g. a threshold). */
function niceScale(values: readonly number[], step: number, include?: number) {
  const all = include === undefined ? values : [...values, include];
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const lo = round(Math.floor(Math.min(...all) / step) * step);
  const hi = round(Math.ceil(Math.max(...all) / step) * step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round(v));
  return { domain: [lo, hi] as [number, number], ticks };
}
const crosshair = { stroke: chrome.muted, strokeWidth: 1 };

/** X-axis label of a projection point: "Praegu", "+1 a" … */
const pointLabel = (index: number) => (index === 0 ? c.now : c.yearAhead(index));

function projectionLabel(points: readonly ProjectionPoint[]) {
  return (label: string) => {
    const index = points.findIndex((_, i) => pointLabel(i) === label);
    const point = points[index];
    return point ? `${label} · ${formatDate(point.date)}` : label;
  };
}

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const cf = c.cashFlow;
  const tooltipSeries: TooltipSeries[] = [
    { key: 'noi', label: cf.noi, color: series[1] },
    { key: 'debtService', label: cf.debtService, color: series[2] },
    { key: 'freeCashFlow', label: cf.freeCashFlow, color: series[3] },
  ];
  const legend: LegendItem[] = [
    { label: cf.noi, color: series[1], shape: 'bar' },
    { label: cf.debtService, color: series[2], shape: 'bar' },
    { label: cf.freeCashFlow, color: series[3], shape: 'line' },
  ];

  return (
    <ChartCard
      title={cf.title}
      description={cf.description}
      legend={legend}
      note={cf.note}
      className="lg:col-span-2"
      table={{
        columns: [c.columns.month, cf.noi, cf.debtService, cf.freeCashFlow],
        rows: data.map((p) => ({
          key: p.month,
          cells: [formatMonth(p.month), eur(p.noi), eur(p.debtService), eur(p.freeCashFlow)],
        })),
      }}
    >
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="month"
              {...axisProps}
              tickFormatter={formatMonthShort}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              {...axisProps}
              axisLine={false}
              tickFormatter={formatCompactCurrency}
              width={72}
            />
            <ReferenceLine y={0} stroke={chrome.axis} />
            <Tooltip
              cursor={{ fill: chrome.hover }}
              content={(props) => (
                <ChartTooltip
                  {...props}
                  series={tooltipSeries}
                  formatValue={eur}
                  formatLabel={formatMonth}
                />
              )}
            />
            <Bar
              dataKey="noi"
              name={cf.noi}
              fill={series[1]}
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
              isAnimationActive={false}
            />
            <Bar
              dataKey="debtService"
              name={cf.debtService}
              fill={series[2]}
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
              isAnimationActive={false}
            />
            <Line dataKey="freeCashFlow" name={cf.freeCashFlow} {...lineProps(series[3])} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function LoanBalanceChart({ points }: { points: ProjectionPoint[] }) {
  const lb = c.loanBalance;
  const data = points.map((p, i) => ({ label: pointLabel(i), loanBalance: p.loanBalance }));
  return (
    <ChartCard
      title={lb.title}
      description={lb.description}
      legend={[{ label: lb.series, color: series[1], shape: 'line' }]}
      note={c.forecastNote}
      table={{
        columns: [c.columns.period, lb.series],
        rows: points.map((p, i) => ({
          key: p.date,
          cells: [`${pointLabel(i)} (${formatDate(p.date)})`, eur(p.loanBalance)],
        })),
      }}
    >
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis
              {...axisProps}
              axisLine={false}
              tickFormatter={formatCompactCurrency}
              width={72}
              domain={[0, 'auto']}
            />
            <Tooltip
              cursor={crosshair}
              content={(props) => (
                <ChartTooltip
                  {...props}
                  series={[{ key: 'loanBalance', label: lb.series, color: series[1] }]}
                  formatValue={eur}
                  formatLabel={projectionLabel(points)}
                />
              )}
            />
            <Line dataKey="loanBalance" name={lb.series} {...lineProps(series[1])} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** One line per scenario for a ratio (LTV or DSCR). */
function ScenarioRatioChart({
  points,
  metric,
  title,
  description,
  format,
  axisFormat,
  step,
  threshold,
}: {
  points: ProjectionPoint[];
  metric: 'ltv' | 'dscr';
  title: string;
  description: string;
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  /** Tick spacing of the value axis. */
  step: number;
  threshold?: { value: number; label: string };
}) {
  const data = points.map((p, i) => ({
    label: pointLabel(i),
    ...Object.fromEntries(scenarioSeries.map((s) => [s.id, p[metric][s.id]])),
  }));
  const values = points.flatMap((p) =>
    scenarioSeries.map((s) => p[metric][s.id]).filter((v): v is number => v !== null),
  );
  const scale = niceScale(values.length > 0 ? values : [0], step, threshold?.value);
  const tooltipSeries: TooltipSeries[] = scenarioSeries.map((s) => ({
    key: s.id,
    label: c.scenario[s.id],
    color: s.color,
  }));
  const legend: LegendItem[] = [
    ...scenarioSeries.map((s) => ({
      label: c.scenario[s.id],
      color: s.color,
      shape: 'line' as const,
    })),
    ...(threshold
      ? [{ label: threshold.label, color: status.critical, shape: 'threshold' as const }]
      : []),
  ];

  return (
    <ChartCard
      title={title}
      description={description}
      legend={legend}
      note={c.forecastNote}
      table={{
        columns: [c.columns.period, ...scenarioSeries.map((s) => c.scenario[s.id])],
        rows: points.map((p, i) => ({
          key: p.date,
          cells: [
            `${pointLabel(i)} (${formatDate(p.date)})`,
            ...scenarioSeries.map((s) => {
              const value = p[metric][s.id];
              return value === null ? dash : format(value);
            }),
          ],
        })),
      }}
    >
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis
              {...axisProps}
              axisLine={false}
              tickFormatter={axisFormat}
              width={56}
              domain={scale.domain}
              ticks={scale.ticks}
            />
            {threshold && (
              <ReferenceLine
                y={threshold.value}
                stroke={status.critical}
                strokeDasharray="4 4"
                label={{
                  value: threshold.label,
                  position: 'insideTopLeft',
                  fill: chrome.inkSecondary,
                  fontSize: 11,
                }}
              />
            )}
            <Tooltip
              cursor={crosshair}
              content={(props) => (
                <ChartTooltip
                  {...props}
                  series={tooltipSeries}
                  formatValue={format}
                  formatLabel={projectionLabel(points)}
                />
              )}
            />
            {scenarioSeries.map((s) => (
              <Line key={s.id} dataKey={s.id} name={c.scenario[s.id]} {...lineProps(s.color)} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function LtvChart({ points }: { points: ProjectionPoint[] }) {
  return (
    <ScenarioRatioChart
      points={points}
      metric="ltv"
      title={c.ltv.title}
      description={c.ltv.description}
      format={(v) => formatPercent(v)}
      axisFormat={(v) => formatPercent(v, 0)}
      step={0.05}
    />
  );
}

export function DscrChart({ points }: { points: ProjectionPoint[] }) {
  return (
    <ScenarioRatioChart
      points={points}
      metric="dscr"
      title={c.dscr.title}
      description={c.dscr.description}
      format={formatMultiple}
      axisFormat={(v) => formatNumber(v, 1)}
      step={0.1}
      threshold={{ value: DSCR_THRESHOLD, label: c.dscr.threshold }}
    />
  );
}

export function ValueEquityChart({ points }: { points: ProjectionPoint[] }) {
  const v = c.value;
  const data = points.map((p, i) => ({
    label: pointLabel(i),
    equity: p.equity,
    loanBalance: p.loanBalance,
    propertyValue: p.propertyValue,
  }));
  const legend: LegendItem[] = [
    { label: v.equity, color: series[1], shape: 'bar' },
    { label: v.loanBalance, color: series[2], shape: 'bar' },
  ];

  return (
    <ChartCard
      title={v.title}
      description={v.description}
      legend={legend}
      note={c.forecastNote}
      table={{
        columns: [c.columns.period, v.propertyValue, v.loanBalance, v.equity],
        rows: points.map((p, i) => ({
          key: p.date,
          cells: [
            `${pointLabel(i)} (${formatDate(p.date)})`,
            eur(p.propertyValue),
            eur(p.loanBalance),
            eur(p.equity),
          ],
        })),
      }}
    >
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis
              {...axisProps}
              axisLine={false}
              tickFormatter={formatCompactCurrency}
              width={72}
            />
            <Tooltip
              cursor={{ fill: chrome.hover }}
              content={(props) => (
                <ChartTooltip
                  {...props}
                  series={[
                    { key: 'equity', label: v.equity, color: series[1] },
                    { key: 'loanBalance', label: v.loanBalance, color: series[2] },
                  ]}
                  formatValue={eur}
                  formatLabel={projectionLabel(points)}
                  extraRows={[
                    { label: v.propertyValue, value: (d) => eur(Number(d.propertyValue)) },
                  ]}
                />
              )}
            />
            {/* Stacked: a 2px surface stroke separates the segments; the top segment is rounded. */}
            <Bar
              dataKey="equity"
              name={v.equity}
              stackId="value"
              fill={series[1]}
              stroke={chrome.surface}
              strokeWidth={2}
              maxBarSize={36}
              isAnimationActive={false}
            />
            <Bar
              dataKey="loanBalance"
              name={v.loanBalance}
              stackId="value"
              fill={series[2]}
              stroke={chrome.surface}
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
