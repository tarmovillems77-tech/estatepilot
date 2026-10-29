import { RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { store } from '@/data';
import {
  useLeases,
  useLoans,
  useProperties,
  useScenarioSets,
  useTenants,
  useTransactionsInRange,
  useUnits,
} from '@/data/hooks';
import { todayIso, trailingTwelveMonths } from '@/domain/dates';
import { scopeData, type DashboardData } from '@/domain/finance/dashboard';
import { defaultScenarioSet, runScenarioSet } from '@/domain/finance/scenarioForecast';
import { scenarioSetSchema } from '@/domain/schemas';
import type { ScenarioSet, ScenarioSetInput } from '@/domain/types';
import { et } from '@/i18n/et';
import { errorMessage } from '@/i18n/validation';
import {
  AnnualTable,
  RefinanceSection,
  ScenarioComparisonChart,
  ScenarioKpis,
} from './ForecastResults';
import { LoanOverrides, PropertyOverrides } from './OverridesEditor';
import { SavedComparison } from './SavedComparison';
import { ScenarioEditor } from './ScenarioEditor';

const f = et.forecast;
const SCOPE_PARAM = 'objekt';
const SET_PARAM = 'komplekt';
const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none';

export function ForecastPage() {
  const [params, setParams] = useSearchParams();
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const tenants = useTenants();
  const loans = useLoans();
  const scenarioSets = useScenarioSets();
  const transactions = useTransactionsInRange({
    from: trailingTwelveMonths(new Date()).from,
    to: todayIso(),
  });

  const page = et.pages.forecast;
  const header = <PageHeader title={page.title} description={page.description} />;
  if (!properties || !units || !leases || !tenants || !loans || !scenarioSets || !transactions) {
    return (
      <>
        {header}
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      </>
    );
  }

  const owned = properties.filter((p) => p.status === 'owned');
  const scopeId = owned.some((p) => p.id === params.get(SCOPE_PARAM))
    ? params.get(SCOPE_PARAM)
    : null;
  const selected = scenarioSets.find((s) => s.id === params.get(SET_PARAM)) ?? null;
  const setParam = (key: string, value: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  return (
    <>
      {header}
      <Workspace
        // A different set (or a newly saved version) starts a fresh working copy.
        key={selected ? `${selected.id}:${selected.updatedAt}` : 'default'}
        data={{ properties, units, leases, tenants, loans, transactions }}
        scopeId={scopeId}
        selected={selected}
        savedSets={scenarioSets}
        onScope={(id) => setParam(SCOPE_PARAM, id)}
        onSelectSet={(id) => setParam(SET_PARAM, id)}
      />
    </>
  );
}

function Workspace({
  data,
  scopeId,
  selected,
  savedSets,
  onScope,
  onSelectSet,
}: {
  data: DashboardData;
  scopeId: string | null;
  selected: ScenarioSet | null;
  savedSets: ScenarioSet[];
  onScope: (id: string | null) => void;
  onSelectSet: (id: string | null) => void;
}) {
  // Stored sets are parsed so ids and timestamps never enter the working copy.
  const original = useMemo<ScenarioSetInput>(
    () => (selected ? scenarioSetSchema.parse(selected) : defaultScenarioSet(f.set.defaultName)),
    [selected],
  );
  const [working, setWorking] = useState<ScenarioSetInput>(() => structuredClone(original));
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(working) !== JSON.stringify(original);

  const scoped = useMemo(() => scopeData(data, scopeId), [data, scopeId]);
  const run = useMemo(() => runScenarioSet(scoped, working, new Date()), [scoped, working]);
  const ownedInScope = scoped.properties.filter((p) => p.status === 'owned');
  const propertyName = (id: string | null) =>
    id === null ? et.loans.portfolioShort : (data.properties.find((p) => p.id === id)?.name ?? '—');

  async function act(action: () => Promise<void>) {
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  const save = () =>
    act(async () => {
      if (!selected) return;
      await store.scenarioSets.update(selected.id, working);
      setMessage(f.set.saved(working.name));
    });
  const saveAs = () =>
    act(async () => {
      const name = newName.trim();
      if (!name) return;
      const created = await store.scenarioSets.create({ ...working, name });
      setNewName('');
      onSelectSet(created.id);
    });
  const remove = () =>
    act(async () => {
      if (!selected || !window.confirm(f.set.deleteConfirm(selected.name))) return;
      await store.scenarioSets.remove(selected.id);
      onSelectSet(null);
    });

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium text-slate-700">
            <span className="mb-1 block">{f.scope}</span>
            <select
              value={scopeId ?? ''}
              onChange={(e) => onScope(e.target.value || null)}
              className={selectClass}
            >
              <option value="">{f.portfolio}</option>
              {data.properties
                .filter((p) => p.status === 'owned')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            <span className="mb-1 block">{f.set.label}</span>
            <select
              value={selected?.id ?? ''}
              onChange={(e) => onSelectSet(e.target.value || null)}
              className={selectClass}
            >
              <option value="">{f.set.defaultName}</option>
              {savedSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {dirty && <StatusBadge tone="amber">{f.set.unsaved}</StatusBadge>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selected && (
            <Button onClick={save} disabled={!dirty}>
              <Save className="size-4" aria-hidden="true" />
              {f.set.save}
            </Button>
          )}
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={f.set.namePlaceholder}
            aria-label={f.set.namePlaceholder}
            maxLength={80}
            className={`${selectClass} w-52`}
          />
          <Button variant="secondary" onClick={saveAs} disabled={newName.trim() === ''}>
            {f.set.saveAs}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setWorking(structuredClone(original))}
            disabled={!dirty}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            {f.set.revert}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setWorking({ ...defaultScenarioSet(working.name), description: working.description })
            }
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {f.set.reset}
          </Button>
          {selected && (
            <Button variant="danger" onClick={remove}>
              <Trash2 className="size-4" aria-hidden="true" />
              {f.set.delete}
            </Button>
          )}
        </div>
        <div className="space-y-1 text-xs text-slate-500">
          <p>{f.set.intro}</p>
          {!selected && <p>{f.set.defaultNote}</p>}
          {working.description && <p className="text-slate-700">{working.description}</p>}
        </div>
        {message && (
          <p className="text-sm text-slate-700" role="status">
            {message}
          </p>
        )}
      </Card>

      <ScenarioKpis run={run} />
      <ScenarioComparisonChart run={run} />
      <AnnualTable run={run} />
      <ScenarioEditor set={working} onChange={setWorking} />
      <PropertyOverrides
        set={working}
        onChange={setWorking}
        properties={ownedInScope}
        units={scoped.units}
        leases={scoped.leases}
      />
      {scoped.loans.length > 0 && (
        <LoanOverrides
          set={working}
          onChange={setWorking}
          loans={scoped.loans}
          propertyName={propertyName}
        />
      )}
      <RefinanceSection set={working} onChange={setWorking} run={run} />
      <SavedComparison
        data={scoped}
        current={run}
        currentName={working.name}
        savedSets={savedSets}
        excludeId={selected?.id ?? null}
      />
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{f.formulasTitle}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          {f.formulas.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
