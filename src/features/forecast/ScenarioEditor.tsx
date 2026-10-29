import { Card } from '@/components/ui/Card';
import { ValueInput } from '@/components/ui/ValueInput';
import { FORECAST_YEARS, type ScenarioId } from '@/domain/finance/forecast';
import type { ScenarioAssumptions, ScenarioSetInput } from '@/domain/types';
import { et } from '@/i18n/et';
import { scenarioOrder } from './metrics';

const f = et.forecast;
type NumberField = Exclude<keyof ScenarioAssumptions, 'euribor3m' | 'euribor6m'>;

interface Row {
  field: NumberField;
  kind: 'percent' | 'number';
  /** Limits in stored units. */
  min: number;
  max: number;
  suffix: string;
}

const groups: { title: string; rows: Row[] }[] = [
  {
    title: f.groups.income,
    rows: [
      { field: 'rentGrowth', kind: 'percent', min: -0.5, max: 0.5, suffix: '%' },
      { field: 'vacancyRate', kind: 'percent', min: 0, max: 1, suffix: '%' },
    ],
  },
  {
    title: f.groups.costs,
    rows: [
      { field: 'opexAdjustment', kind: 'percent', min: -0.9, max: 5, suffix: '%' },
      { field: 'opexGrowth', kind: 'percent', min: -0.5, max: 0.5, suffix: '%' },
      { field: 'maintenanceReservePerM2', kind: 'number', min: 0, max: 1_000, suffix: '€' },
      { field: 'capexReserveRate', kind: 'percent', min: 0, max: 1, suffix: '%' },
    ],
  },
  {
    title: f.groups.value,
    rows: [{ field: 'valueGrowth', kind: 'percent', min: -0.5, max: 0.5, suffix: '%' }],
  },
];

/** Assumptions of the three scenarios side by side; every change recalculates at once. */
export function ScenarioEditor({
  set,
  onChange,
}: {
  set: ScenarioSetInput;
  onChange: (set: ScenarioSetInput) => void;
}) {
  const update = (id: ScenarioId, changes: Partial<ScenarioAssumptions>) =>
    onChange({
      ...set,
      scenarios: { ...set.scenarios, [id]: { ...set.scenarios[id], ...changes } },
    });
  const setPath = (
    id: ScenarioId,
    key: 'euribor3m' | 'euribor6m',
    index: number,
    value: number,
  ) => {
    const path = [...set.scenarios[id][key]];
    path[index] = value;
    update(id, { [key]: path });
  };

  const th = 'px-3 py-2 text-xs font-medium tracking-wide text-slate-500 uppercase';
  const groupRow = (title: string) => (
    <tr key={title} className="bg-slate-50">
      <th
        colSpan={4}
        scope="colgroup"
        className="px-3 py-2 text-left text-sm font-semibold text-slate-900"
      >
        {title}
      </th>
    </tr>
  );
  const labelCell = (label: string, hint?: string) => (
    <th scope="row" className="px-3 py-2 text-left align-top font-normal">
      <span className="text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </th>
  );

  return (
    <Card flush>
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">{f.assumptionsTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{f.assumptionsIntro}</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-y border-slate-200">
            <tr>
              <th className={`${th} text-left`}>{f.rowColumn}</th>
              {scenarioOrder.map((id) => (
                <th key={id} className={`${th} w-36 text-right`}>
                  {et.dashboard.charts.scenario[id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((group) => [
              groupRow(group.title),
              ...group.rows.map((row) => {
                const [label, hint] = f.fields[row.field];
                return (
                  <tr key={row.field}>
                    {labelCell(label, hint || undefined)}
                    {scenarioOrder.map((id) => (
                      <td key={id} className="px-3 py-1.5">
                        <ValueInput
                          label={`${label}: ${et.dashboard.charts.scenario[id]}`}
                          value={set.scenarios[id][row.field]}
                          kind={row.kind}
                          min={row.min}
                          max={row.max}
                          suffix={row.suffix}
                          onChange={(value) => value !== null && update(id, { [row.field]: value })}
                        />
                      </td>
                    ))}
                  </tr>
                );
              }),
            ])}
            {groupRow(f.groups.rates)}
            {(['euribor3m', 'euribor6m'] as const).flatMap((key) =>
              Array.from({ length: FORECAST_YEARS }, (_, index) => {
                const label = f.fields[key](index + 1);
                return (
                  <tr key={`${key}-${index}`}>
                    {labelCell(label)}
                    {scenarioOrder.map((id) => (
                      <td key={id} className="px-3 py-1.5">
                        <ValueInput
                          label={`${label}: ${et.dashboard.charts.scenario[id]}`}
                          value={set.scenarios[id][key][index] ?? 0}
                          kind="percent"
                          min={-0.05}
                          max={0.3}
                          suffix="%"
                          onChange={(value) => value !== null && setPath(id, key, index, value)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              }),
            )}
            <tr>
              {labelCell(f.fields.marginChange[0], f.fields.marginChange[1])}
              {scenarioOrder.map((id) => (
                <td key={id} className="px-3 py-1.5">
                  <ValueInput
                    label={`${f.fields.marginChange[0]}: ${et.dashboard.charts.scenario[id]}`}
                    value={set.scenarios[id].marginChange}
                    kind="percent"
                    min={-0.2}
                    max={0.2}
                    suffix="pp"
                    onChange={(value) => value !== null && update(id, { marginChange: value })}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
