import type { ReactNode } from 'react';
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
import { axisProps, CHART_HEIGHT, chrome, status } from '@/components/charts/theme';
import type { ForecastYear } from '@/domain/finance/forecast';
import { DSCR_THRESHOLD } from '@/domain/finance/dashboard';
import { formatDate } from '@/i18n/format';
import { et } from '@/i18n/et';
import { axisFormatter, formatMetric, metricValue, ratioStep, type MetricKey } from './metrics';

export interface YearSeries {
  key: string;
  label: string;
  color: string;
  years: readonly ForecastYear[];
}

const yearLabel = (year: number) => `${year}. a`;

/** One line per series (scenario or saved set) for a metric over the forecast years. */
export function YearLinesChart({
  title,
  description,
  metric,
  series,
  controls,
  className = '',
}: {
  title: string;
  description: string;
  metric: MetricKey;
  series: readonly YearSeries[];
  /** Selects shown in the card header row (metric, scenario …). */
  controls?: ReactNode;
  className?: string;
}) {
  const first = series[0]?.years ?? [];
  const data = first.map((y, i) => ({
    label: yearLabel(y.year),
    to: y.to,
    ...Object.fromEntries(
      series.map((s) => [s.key, s.years[i] ? metricValue(s.years[i], metric) : null]),
    ),
  }));
  const values = data.flatMap((d) =>
    series
      .map((s) => (d as Record<string, unknown>)[s.key])
      .filter((v): v is number => typeof v === 'number'),
  );
  const step = ratioStep(metric, values);
  const threshold = metric === 'dscr' ? DSCR_THRESHOLD : undefined;
  const scale = step === null ? null : niceScale(values, step, threshold);
  const format = (v: number) => formatMetric(metric, v);

  return (
    <ChartCard
      title={title}
      description={description}
      className={className}
      legend={[
        ...series.map((s) => ({ label: s.label, color: s.color, shape: 'line' as const })),
        ...(threshold
          ? [
              {
                label: et.dashboard.charts.dscr.threshold,
                color: status.critical,
                shape: 'threshold' as const,
              },
            ]
          : []),
      ]}
      table={{
        columns: [et.dashboard.charts.columns.period, ...series.map((s) => s.label)],
        rows: data.map((d, i) => ({
          key: d.label,
          cells: [
            `${d.label} (${formatDate(d.to)})`,
            ...series.map((s) =>
              formatMetric(metric, s.years[i] ? metricValue(s.years[i], metric) : null),
            ),
          ],
        })),
      }}
    >
      {controls && <div className="mb-3 flex flex-wrap gap-3">{controls}</div>}
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke={chrome.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis
              {...axisProps}
              axisLine={false}
              width={72}
              tickFormatter={axisFormatter(metric)}
              {...(scale ? { domain: scale.domain, ticks: scale.ticks } : {})}
            />
            {threshold && (
              <ReferenceLine y={threshold} stroke={status.critical} strokeDasharray="4 4" />
            )}
            <Tooltip
              cursor={{ stroke: chrome.muted, strokeWidth: 1 }}
              content={(props) => (
                <ChartTooltip
                  {...props}
                  series={series}
                  formatValue={format}
                  formatLabel={(label) => {
                    const point = data.find((d) => d.label === label);
                    return point ? `${label} · ${formatDate(point.to)}` : label;
                  }}
                />
              )}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="linear"
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3, fill: s.color, stroke: chrome.surface, strokeWidth: 1 }}
                activeDot={{ r: 5, fill: s.color, stroke: chrome.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
