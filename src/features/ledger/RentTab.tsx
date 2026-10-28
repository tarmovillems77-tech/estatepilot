import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { store } from '@/data';
import { addMonths, todayIso, toIsoDate } from '@/domain/dates';
import {
  arrears,
  monthOf,
  monthsBetween,
  rentLines,
  rentTotals,
  type RentLine,
  type RentStatus,
} from '@/domain/rent';
import { formatCurrency, formatDate, formatMonth } from '@/i18n/format';
import { et } from '@/i18n/et';
import { errorMessage } from '@/i18n/validation';
import { filterClass, thClass, theadClass, type LedgerData } from './shared';

const text = et.ledger.rent;
const eur = (value: number) => formatCurrency(value);
const dash = '—';

const statusTone: Record<RentStatus, 'brand' | 'amber' | 'slate' | 'red'> = {
  paid: 'brand',
  partial: 'amber',
  unpaid: 'red',
  upcoming: 'slate',
};

export function RentTab({ data }: { data: LedgerData }) {
  const today = todayIso();
  const [month, setMonth] = useState(monthOf(today));
  const [propertyId, setPropertyId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const unitById = new Map(data.units.map((u) => [u.id, u]));
  const propertyById = new Map(data.properties.map((p) => [p.id, p]));
  const tenantName = new Map(data.tenants.map((t) => [t.id, t.name]));
  const leases = data.leases.filter((l) =>
    propertyId ? unitById.get(l.unitId)?.propertyId === propertyId : true,
  );

  const lines = rentLines(leases, data.transactions, [month], today).sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
  const totals = rentTotals(lines, today);
  const firstMonth = monthOf(toIsoDate(addMonths(new Date(), -12)));
  const overdue = arrears(
    rentLines(leases, data.transactions, monthsBetween(firstMonth, monthOf(today)), today),
    today,
  ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const describe = (line: RentLine) => {
    const unit = unitById.get(line.unitId);
    const property = unit ? propertyById.get(unit.propertyId) : undefined;
    return { unit, property, tenant: tenantName.get(line.tenantId) ?? dash };
  };

  async function recordPayment(line: RentLine) {
    const { unit, tenant } = describe(line);
    if (!unit || !window.confirm(text.recordPaymentConfirm(eur(line.outstanding), tenant))) return;
    setError(null);
    try {
      await store.transactions.create({
        kind: 'income',
        category: unit.type === 'parking' ? 'parking' : 'rent',
        propertyId: unit.propertyId,
        unitId: unit.id,
        leaseId: line.leaseId,
        date: today,
        periodMonth: line.month,
        amount: line.outstanding,
        description: text.paymentDescription(unit.name),
        counterparty: tenant,
        source: 'manual',
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium">{text.month}</span>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className={filterClass}
          />
        </label>
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className={filterClass}
          aria-label={et.ledger.allProperties}
        >
          <option value="">{et.ledger.allProperties}</option>
          {data.properties
            .filter((p) => p.status === 'owned')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={text.totals.expected}
          value={eur(totals.expected)}
          hint={formatMonth(month)}
        />
        <KpiCard label={text.totals.received} value={eur(totals.received)} />
        <KpiCard
          label={text.totals.overdue}
          value={eur(totals.overdue)}
          tone={totals.overdue > 0 ? 'warning' : 'default'}
        />
        <KpiCard label={text.totals.upcoming} value={eur(totals.upcoming)} />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Card flush>
        {lines.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{text.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>{text.columns.tenant}</th>
                  <th className={thClass}>{text.columns.unit}</th>
                  <th className={thClass}>{text.columns.dueDate}</th>
                  <th className={`${thClass} text-right`}>{text.columns.expected}</th>
                  <th className={`${thClass} text-right`}>{text.columns.received}</th>
                  <th className={`${thClass} text-right`}>{text.columns.outstanding}</th>
                  <th className={thClass}>{text.columns.status}</th>
                  <th className={`${thClass} relative`}>
                    <span className="sr-only">{text.columns.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const { unit, property, tenant } = describe(line);
                  const td = 'tabular px-4 py-3 text-right whitespace-nowrap';
                  return (
                    <tr key={line.leaseId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{tenant}</td>
                      <td className="px-4 py-3">
                        {property ? (
                          <Link
                            to={`/kinnisvara/${property.id}`}
                            className="hover:text-brand-700 text-slate-900 hover:underline"
                          >
                            {property.name}
                          </Link>
                        ) : (
                          dash
                        )}
                        <p className="text-xs text-slate-500">{unit?.name ?? dash}</p>
                      </td>
                      <td className="tabular px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDate(line.dueDate)}
                      </td>
                      <td className={td}>{eur(line.expected)}</td>
                      <td className={td}>{eur(line.received)}</td>
                      <td className={`${td} ${line.outstanding > 0 ? 'font-semibold' : ''}`}>
                        {line.outstanding > 0 ? eur(line.outstanding) : dash}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone[line.status]}>
                          {text.status[line.status]}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {line.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => recordPayment(line)}
                            className="hover:text-brand-700 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            aria-label={text.recordPaymentLabel(tenant)}
                          >
                            <CircleCheck className="size-4" aria-hidden="true" />
                            {text.recordPayment}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{text.note}</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{text.arrearsTitle}</h2>
          {overdue.length > 0 && (
            <p className="tabular font-semibold text-red-700">
              {text.arrearsTotal(eur(overdue.reduce((s, l) => s + l.outstanding, 0)))}
            </p>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">{text.arrearsIntro}</p>
        {overdue.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{text.noArrears}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {overdue.map((line) => {
              const { unit, property, tenant } = describe(line);
              return (
                <li
                  key={`${line.leaseId}:${line.month}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="font-medium text-slate-900">{tenant}</p>
                    <p className="text-slate-500">
                      {property?.name ?? dash} · {unit?.name ?? dash} · {formatMonth(line.month)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge tone={statusTone[line.status]}>
                      {text.status[line.status]}
                    </StatusBadge>
                    <span className="tabular font-semibold text-slate-900">
                      {eur(line.outstanding)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
