import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { useLeases, useLoans, useProperties, useTransactionsInRange, useUnits } from '@/data/hooks';
import { todayIso, trailingTwelveMonths } from '@/domain/dates';
import type { Performance } from '@/domain/finance/metrics';
import { portfolioPerformance } from '@/domain/finance/portfolio';
import { isLeaseActive, occupancyRate } from '@/domain/leases';
import type { Property } from '@/domain/types';
import { formatCurrency, formatDate, formatMultiple, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

/** Below this DSCR banks typically start asking questions. */
const DSCR_WARNING = 1.2;

export function DashboardPage() {
  const now = new Date();
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const loans = useLoans();
  const transactions = useTransactionsInRange(trailingTwelveMonths(now));

  const page = et.pages.dashboard;
  const header = <PageHeader title={page.title} description={page.description} />;

  if (!properties || !units || !leases || !loans || !transactions) {
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
  const performance = portfolioPerformance({ properties, transactions, loans, asOf: now });
  const { total } = performance;
  const ownedLoans = loans.filter((l) => ownedIds.has(l.propertyId));

  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={et.kpi.portfolioValue}
          value={formatCurrency(total.marketValue, { whole: true })}
          hint={et.kpi.ownedProperties(owned.length)}
        />
        <KpiCard
          label={et.kpi.totalDebt}
          value={formatCurrency(total.loanBalance, { whole: true })}
          hint={et.kpi.loanCount(ownedLoans.length)}
        />
        <KpiCard
          label={et.kpi.ltv}
          value={total.ltv === null ? '—' : formatPercent(total.ltv)}
          hint={et.kpi.ltvHint}
        />
        <KpiCard
          label={et.kpi.monthlyNoi}
          value={formatCurrency(total.monthlyNoi, { whole: true })}
          hint={et.kpi.trailingMonthly}
        />
        <KpiCard
          label={et.kpi.monthlyFreeCashFlow}
          value={formatCurrency(total.monthlyFreeCashFlow, { whole: true })}
          hint={et.kpi.afterDebtAndCapex}
        />
        <KpiCard
          label={et.kpi.occupancy}
          value={occupancy === null ? '—' : formatPercent(occupancy, 0)}
          hint={et.kpi.leasedUnits(
            ownedUnits.filter((u) => leasedUnitIds.has(u.id)).length,
            ownedUnits.length,
          )}
        />
      </div>

      <Card className="mt-6 p-0">
        <h2 className="px-5 pt-5 text-lg font-semibold text-slate-900">
          {et.dashboard.propertiesTitle}
        </h2>
        {properties.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{et.dashboard.emptyPortfolio}</p>
        ) : (
          <>
            <PropertyTable
              rows={properties.map((p) => {
                const propertyUnits = units.filter((u) => u.propertyId === p.id);
                return {
                  property: p,
                  unitCount: propertyUnits.length,
                  occupancy:
                    p.status === 'owned' ? occupancyRate(propertyUnits, leases, today) : null,
                  performance: performance.byProperty.get(p.id),
                };
              })}
            />
            <p className="px-5 py-3 text-xs text-slate-500">
              {et.dashboard.periodNote(
                formatDate(performance.period.from),
                formatDate(performance.period.to),
              )}
            </p>
          </>
        )}
      </Card>
    </>
  );
}

interface PropertyRow {
  property: Property;
  unitCount: number;
  occupancy: number | null;
  /** Only for owned properties. */
  performance: Performance | undefined;
}

const dash = '—';

function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  const columns = et.dashboard.columns;
  const th = 'px-4 py-3 font-medium whitespace-nowrap';
  const td = 'tabular px-4 py-3 text-right whitespace-nowrap';

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className={th}>{columns.name}</th>
            <th className={th}>{columns.type}</th>
            <th className={th}>{columns.status}</th>
            <th className={`${th} text-right`}>{columns.units}</th>
            <th className={`${th} text-right`}>{columns.occupancy}</th>
            <th className={`${th} text-right`}>{columns.noi}</th>
            <th className={`${th} text-right`}>{columns.netYield}</th>
            <th className={`${th} text-right`}>{columns.dscr}</th>
            <th className={`${th} text-right`}>{columns.ltv}</th>
            <th className={`${th} text-right`}>{columns.marketValue}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ property, unitCount, occupancy, performance: p }) => (
            <tr key={property.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link
                  to={`/kinnisvara/${property.id}`}
                  className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                >
                  {property.name}
                </Link>
                <p className="text-xs text-slate-500">{property.city}</p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                {et.labels.propertyType[property.type]}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                    property.status === 'owned'
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {et.labels.propertyStatus[property.status]}
                </span>
              </td>
              <td className={td}>{unitCount}</td>
              <td className={td}>{occupancy === null ? dash : formatPercent(occupancy, 0)}</td>
              <td className={td}>{p ? formatCurrency(p.noi, { whole: true }) : dash}</td>
              <td className={td}>{p?.netYield != null ? formatPercent(p.netYield) : dash}</td>
              <td
                className={`${td} ${p?.dscr != null && p.dscr < DSCR_WARNING ? 'font-semibold text-amber-700' : ''}`}
              >
                {p?.dscr != null ? formatMultiple(p.dscr) : dash}
              </td>
              <td className={td}>{p?.ltv != null ? formatPercent(p.ltv) : dash}</td>
              <td className={td}>{formatCurrency(property.marketValue, { whole: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
