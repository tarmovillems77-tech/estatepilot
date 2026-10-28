import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLeases, useProperties, useUnits } from '@/data/hooks';
import { todayIso } from '@/domain/dates';
import { occupancyRate } from '@/domain/leases';
import { propertyStatuses, propertyTypes } from '@/domain/schemas';
import type { PropertyStatus, PropertyType } from '@/domain/types';
import { formatArea, formatCurrency, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

const text = et.properties;

export function PropertyListPage() {
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<PropertyType | ''>('');
  const [status, setStatus] = useState<PropertyStatus | ''>('');

  const header = (
    <PageHeader
      title={et.pages.properties.title}
      description={et.pages.properties.description}
      actions={
        <Link
          to="/kinnisvara/uus"
          className="bg-brand-700 hover:bg-brand-800 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="size-4" aria-hidden="true" />
          {text.add}
        </Link>
      }
    />
  );

  if (!properties || !units || !leases) {
    return (
      <>
        {header}
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      </>
    );
  }

  const today = todayIso();
  const needle = query.trim().toLocaleLowerCase('et');
  const visible = properties
    .filter((p) => (type ? p.type === type : true))
    .filter((p) => (status ? p.status === status : true))
    .filter((p) =>
      needle
        ? [p.name, p.address, p.city].some((v) => v.toLocaleLowerCase('et').includes(needle))
        : true,
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'et'));

  const selectClass =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none';

  return (
    <>
      {header}

      <Card flush>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">{text.search}</span>
            <Search
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={text.search}
              className={`${selectClass} w-full pl-9`}
            />
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PropertyType | '')}
            className={selectClass}
            aria-label={text.columns.type}
          >
            <option value="">{text.allTypes}</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t}>
                {et.labels.propertyType[t]}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PropertyStatus | '')}
            className={selectClass}
            aria-label={text.columns.status}
          >
            <option value="">{text.allStatuses}</option>
            {propertyStatuses.map((s) => (
              <option key={s} value={s}>
                {et.labels.propertyStatus[s]}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            {properties.length === 0 ? text.empty : text.noMatches}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">{text.columns.name}</th>
                  <th className="px-4 py-3 font-medium">{text.columns.type}</th>
                  <th className="px-4 py-3 font-medium">{text.columns.status}</th>
                  <th className="px-4 py-3 text-right font-medium">{text.columns.units}</th>
                  <th className="px-4 py-3 text-right font-medium">{text.columns.occupancy}</th>
                  <th className="px-4 py-3 text-right font-medium">{text.columns.area}</th>
                  <th className="px-4 py-3 text-right font-medium">{text.columns.purchasePrice}</th>
                  <th className="px-4 py-3 text-right font-medium">{text.columns.marketValue}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((p) => {
                  const propertyUnits = units.filter((u) => u.propertyId === p.id);
                  const occupancy =
                    p.status === 'owned' ? occupancyRate(propertyUnits, leases, today) : null;
                  const td = 'tabular px-4 py-3 text-right whitespace-nowrap';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/kinnisvara/${p.id}`}
                          className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {p.address}, {p.city}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {et.labels.propertyType[p.type]}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={p.status === 'owned' ? 'brand' : 'amber'}>
                          {et.labels.propertyStatus[p.status]}
                        </StatusBadge>
                      </td>
                      <td className={td}>{propertyUnits.length}</td>
                      <td className={td}>
                        {occupancy === null ? '—' : formatPercent(occupancy, 0)}
                      </td>
                      <td className={td}>
                        {p.totalArea === undefined ? '—' : formatArea(p.totalArea)}
                      </td>
                      <td className={td}>{formatCurrency(p.purchasePrice, { whole: true })}</td>
                      <td className={td}>{formatCurrency(p.marketValue, { whole: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
