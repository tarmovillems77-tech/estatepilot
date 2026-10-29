import { series as palette } from '@/components/charts/theme';
import type { ForecastYear, ScenarioId } from '@/domain/finance/forecast';
import {
  formatCompactCurrency,
  formatCurrency,
  formatMultiple,
  formatNumber,
  formatPercent,
} from '@/i18n/format';
import { et } from '@/i18n/et';

/** Scenario colours follow the scenario everywhere: base first. */
export const scenarioColor: Record<ScenarioId, string> = {
  base: palette[1],
  pessimistic: palette[2],
  optimistic: palette[3],
};

/** Order in which scenarios are shown everywhere on the forecast page. */
export const scenarioOrder: readonly ScenarioId[] = ['base', 'pessimistic', 'optimistic'];

/** Metrics offered in the comparison charts. */
export type MetricKey = keyof typeof et.forecast.metrics;
export const metricKeys = Object.keys(et.forecast.metrics) as MetricKey[];

type Kind = 'eur' | 'percent' | 'multiple';
const kinds: Record<MetricKey, Kind> = {
  noi: 'eur',
  effectiveGrossIncome: 'eur',
  freeCashFlow: 'eur',
  debtService: 'eur',
  dscr: 'multiple',
  ltv: 'percent',
  loanBalance: 'eur',
  propertyValue: 'eur',
  equity: 'eur',
  netYield: 'percent',
};

export const metricValue = (year: ForecastYear, key: MetricKey): number | null => year[key];

export function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null) return '—';
  switch (kinds[key]) {
    case 'eur':
      return formatCurrency(value, { whole: true });
    case 'percent':
      return formatPercent(value);
    case 'multiple':
      return formatMultiple(value);
  }
}

export function axisFormatter(key: MetricKey): (value: number) => string {
  switch (kinds[key]) {
    case 'eur':
      return formatCompactCurrency;
    case 'percent':
      return (v) => formatPercent(v, 0);
    case 'multiple':
      return (v) => formatNumber(v, 1);
  }
}

/** Round tick step for ratio metrics; amounts use automatic ticks. */
export function ratioStep(key: MetricKey, values: readonly number[]): number | null {
  if (kinds[key] === 'eur') return null;
  const span = Math.max(...values, 0) - Math.min(...values, 0);
  if (kinds[key] === 'multiple') return span > 2 ? 0.5 : 0.1;
  return span > 0.4 ? 0.1 : span > 0.1 ? 0.05 : 0.01;
}
