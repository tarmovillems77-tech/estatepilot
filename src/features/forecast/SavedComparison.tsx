import { useState } from 'react';
import { series as palette } from '@/components/charts/theme';
import { Card } from '@/components/ui/Card';
import type { DashboardData } from '@/domain/finance/dashboard';
import type { ScenarioId } from '@/domain/finance/forecast';
import { runScenarioSet, type ScenarioRun } from '@/domain/finance/scenarioForecast';
import type { ScenarioSet } from '@/domain/types';
import { et } from '@/i18n/et';
import { metricKeys, type MetricKey } from './metrics';
import { YearLinesChart } from './YearLinesChart';

const f = et.forecast;
const MAX_SAVED = 2;
const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-600 focus:outline-none';

/**
 * The current (possibly unsaved) set against up to two saved sets, for one scenario and metric.
 * Colours follow the slot: current = 1, then the saved sets in the order picked.
 */
export function SavedComparison({
  data,
  current,
  currentName,
  savedSets,
  excludeId,
}: {
  data: DashboardData;
  current: ScenarioRun;
  currentName: string;
  savedSets: ScenarioSet[];
  /** The saved set being edited (already shown as the current one). */
  excludeId: string | null;
}) {
  const others = savedSets.filter((s) => s.id !== excludeId);
  const [picked, setPicked] = useState<string[]>(() => others.slice(0, MAX_SAVED).map((s) => s.id));
  const [scenario, setScenario] = useState<ScenarioId>('base');
  const [metric, setMetric] = useState<MetricKey>('freeCashFlow');

  if (others.length === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{f.savedTitle}</h2>
        <p className="mt-2 text-sm text-slate-500">{f.savedNone}</p>
      </Card>
    );
  }

  const asOf = new Date();
  const chosen = others.filter((s) => picked.includes(s.id)).slice(0, MAX_SAVED);
  const series = [
    {
      key: 'current',
      label: `${f.current}: ${currentName}`,
      color: palette[1],
      years: current.total[scenario],
    },
    ...chosen.map((set, i) => ({
      key: set.id,
      label: set.name,
      color: i === 0 ? palette[2] : palette[3],
      years: runScenarioSet(data, set, asOf).total[scenario],
    })),
  ];

  return (
    <YearLinesChart
      title={f.savedTitle}
      description={f.savedDescription}
      metric={metric}
      series={series}
      className="lg:col-span-2"
      controls={
        <>
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
          <label className="flex items-center gap-2 text-sm text-slate-600">
            {f.scenarioPick}
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as ScenarioId)}
              className={selectClass}
            >
              {(['base', 'pessimistic', 'optimistic'] as const).map((id) => (
                <option key={id} value={id}>
                  {et.dashboard.charts.scenario[id]}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <legend className="sr-only">{f.savedPick}</legend>
            <span>{f.savedPick}:</span>
            {others.map((set) => {
              const checked = picked.includes(set.id);
              return (
                <label key={set.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="accent-brand-700"
                    checked={checked}
                    disabled={!checked && picked.length >= MAX_SAVED}
                    onChange={(e) =>
                      setPicked((list) =>
                        e.target.checked ? [...list, set.id] : list.filter((id) => id !== set.id),
                      )
                    }
                  />
                  {set.name}
                </label>
              );
            })}
          </fieldset>
        </>
      }
    />
  );
}
