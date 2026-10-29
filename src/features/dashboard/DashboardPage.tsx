import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  useLeases,
  useLoans,
  useProperties,
  useTenants,
  useTransactionsInRange,
  useUnits,
} from '@/data/hooks';
import { todayIso, trailingTwelveMonths } from '@/domain/dates';
import {
  buildAlerts,
  cashFlowHistory,
  DSCR_THRESHOLD,
  projection,
  scopeData,
  type DashboardData,
} from '@/domain/finance/dashboard';
import type { Performance } from '@/domain/finance/metrics';
import { occupancyRate } from '@/domain/leases';
import type { Property } from '@/domain/types';
import { formatCurrency, formatDate, formatMultiple, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';
import { AlertsPanel } from './AlertsPanel';
import {
  CashFlowChart,
  DscrChart,
  LoanBalanceChart,
  LtvChart,
  ValueEquityChart,
} from './DashboardCharts';

const DSCR_WARNING = DSCR_THRESHOLD;
const eur = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';
const ratio = (value: number | null) => (value === null ? dash : formatPercent(value));
/** URL parameter of the property filter: /?objekt=<id> */
const FILTER_PARAM = 'objekt';

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const loans = useLoans();
  const tenants = useTenants();
  // From the start of the 12-month period up to today: current-month rent is needed for arrears.
  const transactions = useTransactionsInRange({
    from: trailingTwelveMonths(new Date()).from,
    to: today,
  });

  const owned = (properties ?? []).filter((p) => p.status === 'owned');
  const requested = params.get(FILTER_PARAM);
  const propertyId = owned.some((p) => p.id === requested) ? requested : null;

  const view = useMemo(() => {
    if (!properties || !units || !leases || !loans || !tenants || !transactions) return null;
    const now = new Date();
    const data: DashboardData = { properties, units, leases, tenants, transactions, loans };
    const scoped = scopeData(data, propertyId);
    const cashFlow = cashFlowHistory(scoped, now);
    const proj = projection(scoped, now);
    return {
      scoped,
      cashFlow,
      projection: proj,
      alerts: buildAlerts(scoped, now, { cashFlow, projection: proj }),
    };
  }, [properties, units, leases, loans, tenants, transactions, propertyId]);

  const page = et.pages.dashboard;
  const header = <PageHeader title={page.title} description={page.description} />;

  if (!view || !properties || !units || !leases || !loans) {
    return (
      <>
        {header}
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      </>
    );
  }

  const { scoped, projection: proj } = view;
  const performance = proj.performance;
  const { total } = performance;
  const scopedOwned = scoped.properties.filter((p) => p.status === 'owned');
  const ownedIds = new Set(scopedOwned.map((p) => p.id));
  const occupancy = occupancyRate(
    scoped.units.filter((u) => ownedIds.has(u.propertyId)),
    scoped.leases,
    today,
  );
  const loanCount = scoped.loans.filter(
    (l) => l.propertyId === null || ownedIds.has(l.propertyId),
  ).length;
  const k = et.kpi;
  const f = et.dashboard.filter;

  return (
    <>
      {header}

      {/* One filter row above everything it scopes. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label htmlFor="dashboard-filter" className="text-sm font-medium text-slate-700">
          {f.label}
        </label>
        <select
          id="dashboard-filter"
          value={propertyId ?? ''}
          onChange={(e) => setParams(e.target.value ? { [FILTER_PARAM]: e.target.value } : {})}
          className="focus:border-brand-600 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none"
        >
          <option value="">{f.portfolio}</option>
          {owned.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <section aria-labelledby="key-figures">
        <h2 id="key-figures" className="sr-only">
          {et.dashboard.keyFigures}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={k.portfolioValue}
            value={eur(total.marketValue)}
            hint={k.portfolioHint(scopedOwned.length, ratio(occupancy))}
          />
          <KpiCard label={k.equity} value={eur(total.equity)} hint={k.equityHint} />
          <KpiCard
            label={k.totalDebt}
            value={eur(total.loanBalance)}
            hint={k.loanCount(loanCount)}
          />
          <KpiCard label={k.ltv} value={ratio(total.ltv)} hint={k.ltvHint} />
          <KpiCard label={k.monthlyNoi} value={eur(total.monthlyNoi)} hint={k.trailingMonthly} />
          <KpiCard
            label={k.monthlyFreeCashFlow}
            value={eur(total.monthlyFreeCashFlow)}
            hint={k.afterDebtAndCapex}
            tone={total.monthlyFreeCashFlow < 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label={k.dscr}
            value={total.dscr === null ? dash : formatMultiple(total.dscr)}
            hint={k.dscrHint}
            tone={total.dscr !== null && total.dscr < DSCR_WARNING ? 'warning' : 'default'}
          />
          <KpiCard label={k.netYield} value={ratio(total.netYield)} hint={k.netYieldHint} />
        </div>
      </section>

      <div className="mt-6">
        <AlertsPanel alerts={view.alerts} data={scoped} />
      </div>

      <section aria-labelledby="charts" className="mt-6">
        <h2 id="charts" className="mb-3 text-lg font-semibold text-slate-900">
          {et.dashboard.charts.title}
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CashFlowChart data={view.cashFlow} />
          <LoanBalanceChart points={proj.points} />
          <LtvChart points={proj.points} />
          <DscrChart points={proj.points} />
          <ValueEquityChart points={proj.points} />
        </div>
      </section>

      <Card flush className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <h2 className="text-lg font-semibold text-slate-900">{et.dashboard.overviewTitle}</h2>
          <Link
            to="/kinnisvara"
            className="text-brand-700 inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            {et.dashboard.allProperties}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        {scoped.properties.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{et.dashboard.emptyPortfolio}</p>
        ) : (
          <>
            <PropertyTable
              rows={scoped.properties.map((p) => ({
                property: p,
                occupancy:
                  p.status === 'owned'
                    ? occupancyRate(
                        units.filter((u) => u.propertyId === p.id),
                        leases,
                        today,
                      )
                    : null,
                performance: performance.byProperty.get(p.id),
              }))}
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
  occupancy: number | null;
  /** Only for owned properties. */
  performance: Performance | undefined;
}

function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  const columns = et.dashboard.columns;
  const th = 'px-4 py-2.5 font-medium whitespace-nowrap';
  const td = 'tabular px-4 py-2.5 text-right whitespace-nowrap';
  const sorted = [...rows].sort(
    (a, b) =>
      Number(a.property.status !== 'owned') - Number(b.property.status !== 'owned') ||
      a.property.name.localeCompare(b.property.name, 'et'),
  );

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className={th}>{columns.name}</th>
            <th className={`${th} hidden text-right xl:table-cell`}>{columns.occupancy}</th>
            <th className={`${th} text-right`}>{columns.noi}</th>
            <th className={`${th} text-right`}>{columns.netYield}</th>
            <th className={`${th} text-right`}>{columns.dscr}</th>
            <th className={`${th} text-right`}>{columns.ltv}</th>
            <th className={`${th} text-right`}>{columns.marketValue}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(({ property, occupancy, performance: p }) => (
            <tr key={property.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link
                    to={`/kinnisvara/${property.id}`}
                    className="hover:text-brand-700 font-medium whitespace-nowrap text-slate-900 hover:underline"
                  >
                    {property.name}
                  </Link>
                  {property.status === 'prospect' && (
                    <StatusBadge tone="amber">{et.labels.propertyStatus.prospect}</StatusBadge>
                  )}
                </div>
                <p className="text-xs whitespace-nowrap text-slate-500">
                  {et.labels.propertyType[property.type]} · {property.city}
                </p>
              </td>
              <td className={`${td} hidden xl:table-cell`}>
                {occupancy === null ? dash : formatPercent(occupancy, 0)}
              </td>
              <td className={td}>{p ? eur(p.noi) : dash}</td>
              <td className={td}>{p ? ratio(p.netYield) : dash}</td>
              <td
                className={`${td} ${p?.dscr != null && p.dscr < DSCR_WARNING ? 'font-semibold text-amber-700' : ''}`}
              >
                {p?.dscr != null ? formatMultiple(p.dscr) : dash}
              </td>
              <td className={td}>{p ? ratio(p.ltv) : dash}</td>
              <td className={td}>{eur(property.marketValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
