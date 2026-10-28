import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { store } from '@/data';
import { useLeases, useProperties, useTenants, useUnits } from '@/data/hooks';
import { todayIso } from '@/domain/dates';
import { effectiveIndexation, isLeaseActive, leaseStatus, type LeaseStatus } from '@/domain/leases';
import type { Lease, Property, Tenant, Unit } from '@/domain/types';
import { formatCurrency } from '@/i18n/format';
import { et } from '@/i18n/et';
import { errorMessage } from '@/i18n/validation';
import { indexationLabel, statusTone, termLabel } from './labels';
import { LeaseAlerts } from './LeaseAlerts';
import { LeaseDialog } from './LeaseDialog';
import { TenantDialog } from './TenantDialog';

const text = et.leases;
const eur = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';

type Tab = 'leases' | 'tenants';
/** URL value of the tenants tab: /uurnikud?vaade=uurnikud */
const TENANTS_VIEW = 'uurnikud';

const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none';
const th = 'px-4 py-3 font-medium whitespace-nowrap';
const iconButton = 'rounded-md p-1.5 text-slate-500 hover:bg-slate-100';

export function TenantsLeasesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('vaade') === TENANTS_VIEW ? 'tenants' : 'leases';
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const tenants = useTenants();
  const [leaseDialog, setLeaseDialog] = useState<{ lease?: Lease } | null>(null);
  const [tenantDialog, setTenantDialog] = useState<{ tenant?: Tenant } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const page = et.pages.tenants;
  const actions = (
    <>
      <Button variant="secondary" onClick={() => setTenantDialog({})}>
        <Plus className="size-4" aria-hidden="true" />
        {et.tenants.add}
      </Button>
      <Button onClick={() => setLeaseDialog({})}>
        <Plus className="size-4" aria-hidden="true" />
        {text.add}
      </Button>
    </>
  );

  if (!properties || !units || !leases || !tenants) {
    return (
      <>
        <PageHeader title={page.title} description={page.description} />
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      </>
    );
  }

  const today = todayIso();

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  const tabClass = (active: boolean) =>
    `border-b-2 px-1 pb-3 text-sm font-medium ${
      active
        ? 'border-brand-700 text-brand-700'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <>
      <PageHeader title={page.title} description={page.description} actions={actions} />

      <LeaseAlerts
        properties={properties}
        units={units}
        leases={leases}
        tenants={tenants}
        today={today}
      />

      <div className="mt-6 flex gap-6 border-b border-slate-200" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'leases'}
          className={tabClass(tab === 'leases')}
          onClick={() => setParams({})}
        >
          {text.tabs.leases} ({leases.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tenants'}
          className={tabClass(tab === 'tenants')}
          onClick={() => setParams({ vaade: TENANTS_VIEW })}
        >
          {text.tabs.tenants} ({tenants.length})
        </button>
      </div>

      {actionError && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {actionError}
        </p>
      )}

      <div className="mt-4">
        {tab === 'leases' ? (
          <LeasesTable
            properties={properties}
            units={units}
            leases={leases}
            tenants={tenants}
            today={today}
            onEdit={(lease) => setLeaseDialog({ lease })}
            onDelete={(lease, label) =>
              window.confirm(text.deleteConfirm(label.tenant, label.unit)) &&
              run(() => store.leases.remove(lease.id))
            }
          />
        ) : (
          <TenantsTable
            properties={properties}
            units={units}
            leases={leases}
            tenants={tenants}
            today={today}
            onEdit={(tenant) => setTenantDialog({ tenant })}
            onDelete={(tenant) =>
              window.confirm(et.tenants.deleteConfirm(tenant.name)) &&
              run(() => store.tenants.remove(tenant.id))
            }
          />
        )}
      </div>

      <LeaseDialog
        open={leaseDialog !== null}
        onClose={() => setLeaseDialog(null)}
        lease={leaseDialog?.lease}
      />
      <TenantDialog
        open={tenantDialog !== null}
        onClose={() => setTenantDialog(null)}
        tenant={tenantDialog?.tenant}
      />
    </>
  );
}

type StatusFilter = '' | 'current' | 'endingSoon' | 'upcoming' | 'ended';

const statusMatches: Record<Exclude<StatusFilter, ''>, LeaseStatus[]> = {
  current: ['active', 'endingSoon'],
  endingSoon: ['endingSoon'],
  upcoming: ['upcoming'],
  ended: ['ended'],
};

const statusOrder: Record<LeaseStatus, number> = {
  endingSoon: 0,
  active: 1,
  upcoming: 2,
  ended: 3,
};

function LeasesTable({
  properties,
  units,
  leases,
  tenants,
  today,
  onEdit,
  onDelete,
}: {
  properties: Property[];
  units: Unit[];
  leases: Lease[];
  tenants: Tenant[];
  today: string;
  onEdit: (lease: Lease) => void;
  onDelete: (lease: Lease, label: { tenant: string; unit: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('current');
  const [propertyId, setPropertyId] = useState('');

  const unitById = new Map(units.map((u) => [u.id, u]));
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const needle = query.trim().toLocaleLowerCase('et');

  const rows = leases
    .map((lease) => {
      const unit = unitById.get(lease.unitId);
      const property = unit ? propertyById.get(unit.propertyId) : undefined;
      return {
        lease,
        unit,
        property,
        tenant: tenantById.get(lease.tenantId),
        status: leaseStatus(lease, today),
      };
    })
    .filter((r) => (status ? statusMatches[status].includes(r.status) : true))
    .filter((r) => (propertyId ? r.property?.id === propertyId : true))
    .filter((r) =>
      needle
        ? [r.tenant?.name, r.unit?.name, r.property?.name].some((v) =>
            v?.toLocaleLowerCase('et').includes(needle),
          )
        : true,
    )
    .sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        (a.lease.endDate ?? '9999').localeCompare(b.lease.endDate ?? '9999'),
    );

  const td = 'tabular px-4 py-3 text-right whitespace-nowrap';

  return (
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
            className={`${inputClass} w-full pl-9`}
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className={`${inputClass} w-full sm:w-auto`}
          aria-label={text.columns.status}
        >
          <option value="">{text.allStatuses}</option>
          {(Object.keys(statusMatches) as Exclude<StatusFilter, ''>[]).map((s) => (
            <option key={s} value={s}>
              {text.statusFilter[s]}
            </option>
          ))}
        </select>
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className={`${inputClass} w-full sm:w-auto`}
          aria-label={text.columns.unit}
        >
          <option value="">{text.allProperties}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">
          {leases.length === 0 ? text.empty : text.noMatches}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className={th}>{text.columns.tenant}</th>
                <th className={th}>{text.columns.unit}</th>
                <th className={th}>{text.columns.term}</th>
                <th className={`${th} text-right`}>{text.columns.rent}</th>
                <th className={th}>{text.columns.indexation}</th>
                <th className={`${th} text-right`}>{text.columns.deposit}</th>
                <th className={th}>{text.columns.status}</th>
                <th className={`${th} relative`}>
                  <span className="sr-only">{text.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ lease, unit, property, tenant, status: s }) => {
                const label = { tenant: tenant?.name ?? dash, unit: unit?.name ?? dash };
                return (
                  <tr key={lease.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{label.tenant}</td>
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
                      <p className="text-xs text-slate-500">{label.unit}</p>
                    </td>
                    <td className="tabular px-4 py-3 whitespace-nowrap text-slate-600">
                      {termLabel(lease)}
                    </td>
                    <td className={td}>{eur(lease.monthlyRent)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {property ? indexationLabel(effectiveIndexation(lease, property)) : dash}
                    </td>
                    <td className={td}>{lease.deposit > 0 ? eur(lease.deposit) : dash}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone[s]}>{text.status[s]}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onEdit(lease)}
                        className={`${iconButton} hover:text-brand-700`}
                        aria-label={`${text.edit}: ${label.tenant}, ${label.unit}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(lease, label)}
                        className={`${iconButton} hover:bg-red-50 hover:text-red-700`}
                        aria-label={`${text.delete}: ${label.tenant}, ${label.unit}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TenantsTable({
  properties,
  units,
  leases,
  tenants,
  today,
  onEdit,
  onDelete,
}: {
  properties: Property[];
  units: Unit[];
  leases: Lease[];
  tenants: Tenant[];
  today: string;
  onEdit: (tenant: Tenant) => void;
  onDelete: (tenant: Tenant) => void;
}) {
  const [query, setQuery] = useState('');
  const t = et.tenants;
  const unitById = new Map(units.map((u) => [u.id, u]));
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const needle = query.trim().toLocaleLowerCase('et');

  const rows = [...tenants]
    .filter((tenant) =>
      needle
        ? [tenant.name, tenant.email].some((v) => v?.toLocaleLowerCase('et').includes(needle))
        : true,
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'et'));

  return (
    <Card flush>
      <div className="border-b border-slate-200 p-4">
        <label className="relative block">
          <span className="sr-only">{t.search}</span>
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className={`${inputClass} w-full pl-9`}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">{tenants.length === 0 ? t.empty : t.noMatches}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className={th}>{t.columns.name}</th>
                <th className={th}>{t.columns.contact}</th>
                <th className={th}>{t.columns.leases}</th>
                <th className={`${th} text-right`}>{t.columns.rent}</th>
                <th className={`${th} relative`}>
                  <span className="sr-only">{t.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((tenant) => {
                const active = leases.filter(
                  (l) => l.tenantId === tenant.id && isLeaseActive(l, today),
                );
                return (
                  <tr key={tenant.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{tenant.name}</p>
                      <p className="text-xs text-slate-500">
                        {et.labels.tenantKind[tenant.kind]}
                        {tenant.registryCode && ` · ${tenant.registryCode}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {tenant.email && <p>{tenant.email}</p>}
                      {tenant.phone && <p>{tenant.phone}</p>}
                      {!tenant.email && !tenant.phone && dash}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {active.length === 0
                        ? t.noActiveLeases
                        : active.map((lease) => {
                            const unit = unitById.get(lease.unitId);
                            const property = unit && propertyById.get(unit.propertyId);
                            return (
                              <p key={lease.id}>
                                {property?.name ?? dash} · {unit?.name ?? dash}
                              </p>
                            );
                          })}
                    </td>
                    <td className="tabular px-4 py-3 text-right whitespace-nowrap">
                      {active.length === 0
                        ? dash
                        : eur(active.reduce((sum, l) => sum + l.monthlyRent, 0))}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onEdit(tenant)}
                        className={`${iconButton} hover:text-brand-700`}
                        aria-label={`${t.edit}: ${tenant.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(tenant)}
                        className={`${iconButton} hover:bg-red-50 hover:text-red-700`}
                        aria-label={`${t.delete}: ${tenant.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
