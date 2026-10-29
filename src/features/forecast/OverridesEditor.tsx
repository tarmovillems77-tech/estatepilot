import { Card } from '@/components/ui/Card';
import { ValueInput } from '@/components/ui/ValueInput';
import { todayIso } from '@/domain/dates';
import { loanPosition } from '@/domain/finance/loan';
import type { Lease, Loan, Property, ScenarioSetInput, Unit } from '@/domain/types';
import { termLabel } from '@/features/loans/labels';
import { formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

const f = et.forecast;
const th = 'px-3 py-2 text-xs font-medium tracking-wide whitespace-nowrap text-slate-500 uppercase';

/** Per-property rent indexation and value change used in the forecast only. */
export function PropertyOverrides({
  set,
  onChange,
  properties,
  units,
  leases,
}: {
  set: ScenarioSetInput;
  onChange: (set: ScenarioSetInput) => void;
  properties: readonly Property[];
  units: readonly Unit[];
  leases: readonly Lease[];
}) {
  const today = todayIso();
  const update = (id: string, changes: Partial<ScenarioSetInput['propertyOverrides'][string]>) => {
    const current = set.propertyOverrides[id] ?? { rentIndexation: null, valueGrowth: null };
    onChange({
      ...set,
      propertyOverrides: { ...set.propertyOverrides, [id]: { ...current, ...changes } },
    });
  };

  return (
    <Card flush>
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">{f.propertyTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{f.propertyIntro}</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-y border-slate-200">
            <tr>
              <th className={`${th} text-left`}>{f.propertyColumns.property}</th>
              <th className={`${th} text-left`}>{f.propertyColumns.stored}</th>
              <th className={`${th} w-40 text-right`}>{f.propertyColumns.indexation}</th>
              <th className={`${th} w-40 text-right`}>{f.propertyColumns.valueGrowth}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {properties.map((p) => {
              const unitIds = new Set(units.filter((u) => u.propertyId === p.id).map((u) => u.id));
              const ownRate = leases.filter(
                (l) =>
                  unitIds.has(l.unitId) &&
                  l.annualIndexation !== null &&
                  l.startDate <= today &&
                  (l.endDate === null || l.endDate >= today),
              ).length;
              const override = set.propertyOverrides[p.id];
              return (
                <tr key={p.id}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                    {p.name}
                  </th>
                  <td className="px-3 py-2 text-slate-600">
                    {p.rentIndexation === null
                      ? f.storedIndexation.none
                      : f.storedIndexation.value(formatPercent(p.rentIndexation))}
                    {ownRate > 0 && (
                      <span className="block text-xs text-slate-500">
                        {f.storedIndexation.leases(ownRate)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <ValueInput
                      label={`${f.propertyColumns.indexation}: ${p.name}`}
                      value={override?.rentIndexation ?? null}
                      kind="percent"
                      allowEmpty
                      min={0}
                      max={1}
                      suffix="%"
                      onChange={(value) => update(p.id, { rentIndexation: value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <ValueInput
                      label={`${f.propertyColumns.valueGrowth}: ${p.name}`}
                      value={override?.valueGrowth ?? null}
                      kind="percent"
                      allowEmpty
                      min={-0.5}
                      max={0.5}
                      suffix="%"
                      onChange={(value) => update(p.id, { valueGrowth: value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Per-loan margin and remaining repayment period from the forecast start. */
export function LoanOverrides({
  set,
  onChange,
  loans,
  propertyName,
}: {
  set: ScenarioSetInput;
  onChange: (set: ScenarioSetInput) => void;
  loans: readonly Loan[];
  propertyName: (id: string | null) => string;
}) {
  const today = todayIso();
  const update = (id: string, changes: Partial<ScenarioSetInput['loanOverrides'][string]>) => {
    const current = set.loanOverrides[id] ?? { margin: null, remainingYears: null };
    onChange({ ...set, loanOverrides: { ...set.loanOverrides, [id]: { ...current, ...changes } } });
  };

  return (
    <Card flush>
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">{f.loanTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{f.loanIntro}</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-y border-slate-200">
            <tr>
              <th className={`${th} text-left`}>{f.loanColumns.loan}</th>
              <th className={`${th} text-left`}>{f.loanColumns.current}</th>
              <th className={`${th} w-40 text-right`}>{f.loanColumns.margin}</th>
              <th className={`${th} w-40 text-right`}>{f.loanColumns.remainingYears}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loans.map((loan) => {
              const position = loanPosition(loan, today);
              const override = set.loanOverrides[loan.id];
              const label = `${loan.lender}${loan.reference ? ` · ${loan.reference}` : ''}`;
              return (
                <tr key={loan.id}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="font-medium text-slate-900">{label}</span>
                    <span className="block text-xs text-slate-500">
                      {propertyName(loan.propertyId)}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-slate-600">
                    {loan.rateType === 'euribor'
                      ? `${loan.euriborTenor} + ${formatPercent(loan.margin, 2)}`
                      : formatPercent(loan.fixedRate, 2)}
                    <span className="block text-xs text-slate-500">
                      {termLabel(position.paymentsLeft)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    {loan.rateType === 'euribor' ? (
                      <ValueInput
                        label={`${f.loanColumns.margin}: ${label}`}
                        value={override?.margin ?? null}
                        kind="percent"
                        allowEmpty
                        min={0}
                        max={0.2}
                        suffix="%"
                        onChange={(value) => update(loan.id, { margin: value })}
                      />
                    ) : (
                      <span className="block text-right text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <ValueInput
                      label={`${f.loanColumns.remainingYears}: ${label}`}
                      value={override?.remainingYears ?? null}
                      kind="integer"
                      allowEmpty
                      min={1}
                      max={50}
                      suffix="a"
                      onChange={(value) => update(loan.id, { remainingYears: value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
