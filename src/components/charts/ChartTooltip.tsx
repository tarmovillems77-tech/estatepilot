import type { TooltipContentProps } from 'recharts';
import { chrome } from './theme';

export interface TooltipSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Readout for every series at the hovered position: value first (strong), series name
 * second, keyed by a short line of the series colour.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  series,
  formatValue,
  formatLabel,
  extraRows = [],
}: Pick<TooltipContentProps<number, string>, 'active' | 'payload' | 'label'> & {
  series: readonly TooltipSeries[];
  formatValue: (value: number) => string;
  formatLabel?: (label: string) => string;
  /** Additional derived rows (e.g. a total), computed from the hovered data point. */
  extraRows?: readonly { label: string; value: (datum: Record<string, unknown>) => string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  const heading = formatLabel ? formatLabel(String(label)) : String(label);

  return (
    <div className="max-w-[calc(100vw-2rem)] min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-xs font-medium text-slate-500">{heading}</p>
      <ul className="space-y-1">
        {series.map((s) => {
          const value = datum[s.key];
          if (typeof value !== 'number') return null;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-3 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span className="tabular font-semibold" style={{ color: chrome.ink }}>
                {formatValue(value)}
              </span>
              <span className="text-xs" style={{ color: chrome.inkSecondary }}>
                {s.label}
              </span>
            </li>
          );
        })}
        {extraRows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 border-t border-slate-100 pt-1">
            <span className="inline-block w-3" aria-hidden="true" />
            <span className="tabular font-semibold" style={{ color: chrome.ink }}>
              {row.value(datum)}
            </span>
            <span className="text-xs" style={{ color: chrome.inkSecondary }}>
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
