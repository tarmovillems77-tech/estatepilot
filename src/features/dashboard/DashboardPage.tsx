import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { useLeases, useProperties, useUnits } from '@/data/hooks';
import { todayIso } from '@/domain/dates';
import { isLeaseActive, occupancyRate } from '@/domain/leases';
import type { Property } from '@/domain/types';
import { formatCurrency, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

export function DashboardPage() {
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();

  const page = et.pages.dashboard;
  const header = <PageHeader title={page.title} description={page.description} />;

  if (!properties || !units || !leases) {
    return (
      <>
        {header}
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      </>
    );
  }

  const today = todayIso();
  const owned = properties.filter((p) => p.status === 'owned');
  const ownedIds = new Set(owned.map((p) => p.id));
  const ownedUnits = units.filter((u) => ownedIds.has(u.propertyId));
  const leasedUnitIds = new Set(leases.filter((l) => isLeaseActive(l, today)).map((l) => l.unitId));
  const occupancy = occupancyRate(ownedUnits, leases, today);
  const portfolioValue = owned.reduce((sum, p) => sum + p.marketValue, 0);
  const pending = et.kpi.calculationPending;

  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={et.kpi.portfolioValue}
          value={formatCurrency(portfolioValue, { whole: true })}
          hint={et.kpi.ownedProperties(owned.length)}
        />
        <KpiCard
          label={et.kpi.occupancy}
          value={occupancy === null ? '—' : formatPercent(occupancy, 0)}
          hint={et.kpi.leasedUnits(
            ownedUnits.filter((u) => leasedUnitIds.has(u.id)).length,
            ownedUnits.length,
          )}
        />
        <KpiCard label={et.kpi.totalDebt} value="—" hint={pending} />
        <KpiCard label={et.kpi.ltv} value="—" hint={pending} />
        <KpiCard label={et.kpi.monthlyNoi} value="—" hint={pending} />
        <KpiCard label={et.kpi.monthlyFreeCashFlow} value="—" hint={pending} />
      </div>

      <Card className="mt-6 p-0">
        <h2 className="px-5 pt-5 text-lg font-semibold text-slate-900">
          {et.dashboard.propertiesTitle}
        </h2>
        {properties.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{et.dashboard.emptyPortfolio}</p>
        ) : (
          <PropertyTable
            rows={properties.map((p) => {
              const propertyUnits = units.filter((u) => u.propertyId === p.id);
              return {
                property: p,
                unitCount: propertyUnits.length,
                occupancy:
                  p.status === 'owned' ? occupancyRate(propertyUnits, leases, today) : null,
              };
            })}
          />
        )}
      </Card>
    </>
  );
}

interface PropertyRow {
  property: Property;
  unitCount: number;
  occupancy: number | null;
}

function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  const columns = et.dashboard.columns;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-5 py-3 font-medium">{columns.name}</th>
            <th className="px-5 py-3 font-medium">{columns.type}</th>
            <th className="px-5 py-3 font-medium">{columns.status}</th>
            <th className="px-5 py-3 font-medium">{columns.city}</th>
            <th className="px-5 py-3 text-right font-medium">{columns.units}</th>
            <th className="px-5 py-3 text-right font-medium">{columns.occupancy}</th>
            <th className="px-5 py-3 text-right font-medium">{columns.marketValue}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ property, unitCount, occupancy }) => (
            <tr key={property.id} className="hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-900">{property.name}</td>
              <td className="px-5 py-3 text-slate-600">{et.labels.propertyType[property.type]}</td>
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    property.status === 'owned'
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {et.labels.propertyStatus[property.status]}
                </span>
              </td>
              <td className="px-5 py-3 text-slate-600">{property.city}</td>
              <td className="tabular px-5 py-3 text-right">{unitCount}</td>
              <td className="tabular px-5 py-3 text-right">
                {occupancy === null ? '—' : formatPercent(occupancy, 0)}
              </td>
              <td className="tabular px-5 py-3 text-right">
                {formatCurrency(property.marketValue, { whole: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
