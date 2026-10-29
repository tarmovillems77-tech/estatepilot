import { useId, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { et } from '@/i18n/et';

export interface LegendItem {
  label: string;
  color: string;
  /** Mirrors the mark: a block for bars, a line for lines, a dashed line for thresholds. */
  shape: 'bar' | 'line' | 'threshold';
}

export interface ChartTable {
  columns: readonly string[];
  rows: readonly { key: string; cells: readonly string[] }[];
}

/**
 * Chart frame: title, description, legend, the chart, and a table view with the same
 * figures (every value stays readable without hovering or seeing colour).
 */
export function ChartCard({
  title,
  description,
  legend,
  note,
  table,
  className = '',
  children,
}: {
  title: string;
  description: string;
  legend: readonly LegendItem[];
  note?: string;
  table: ChartTable;
  className?: string;
  children: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const titleId = useId();
  const c = et.dashboard.charts;
  const toggle = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium ${
      active ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'
    }`;

  return (
    <Card className={`flex min-w-0 flex-col ${className}`}>
      <section aria-labelledby={titleId} className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={titleId} className="font-semibold text-slate-900">
              {title}
            </h3>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex gap-1" role="group" aria-label={title}>
            <button
              type="button"
              className={toggle(view === 'chart')}
              aria-pressed={view === 'chart'}
              onClick={() => setView('chart')}
            >
              {c.showChart}
            </button>
            <button
              type="button"
              className={toggle(view === 'table')}
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              {c.showTable}
            </button>
          </div>
        </div>

        {legend.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {legend.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <LegendKey {...item} />
                {item.label}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex-1">
          {view === 'chart' ? (
            children
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    {table.columns.map((column, index) => (
                      <th
                        key={column}
                        className={`px-2 py-2 font-medium whitespace-nowrap ${index > 0 ? 'text-right' : ''}`}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {table.rows.map((row) => (
                    <tr key={row.key}>
                      {row.cells.map((cell, index) => (
                        <td
                          key={index}
                          className={`px-2 py-1.5 whitespace-nowrap ${index > 0 ? 'tabular text-right' : 'text-slate-700'}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
      </section>
    </Card>
  );
}

function LegendKey({ color, shape }: LegendItem) {
  if (shape === 'bar') {
    return <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: color }} />;
  }
  return (
    <span
      className="inline-block w-4"
      style={{ borderTop: `2px ${shape === 'threshold' ? 'dashed' : 'solid'} ${color}` }}
    />
  );
}
