import { ArrowRight, ChartColumn, ChartLine, Landmark } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LeaseAlerts } from '@/features/leases/LeaseAlerts';
import {
  useLeases,
  useLoans,
  useProperties,
  useTenants,
  useTransactionsInRange,
  useUnits,
} from '@/data/hooks';
import { todayIso, trailingTwelveMonths } from '@/domain/dates';
import { defaultScenarios } from '@/domain/finance/forecast';
import type { Performance } from '@/domain/finance/metrics';
import { portfolioForecast, portfolioPerformance } from '@/domain/finance/portfolio';
import { occupancyRate } from '@/domain/leases';
import type { Property } from '@/domain/types';
import { formatCurrency, formatDate, formatMultiple, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';

/** Below this DSCR banks typically start asking questions. */
const DSCR_WARNING = 1.2;

const eur = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';
const ratio = (value: number | null) => (value === null ? dash : formatPercent(value));

export function DashboardPage() {
  const now = new Date();
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const loans = useLoans();
  const tenants = useTenants();
  // From the start of the 12-month period up to today: current-month rent is needed for arrears.
  const transactions = useTransactionsInRange({
    from: trailingTwelveMonths(now).from,
    to: todayIso(),
  });

  const page = et.pages.dashboard;
  const header = <PageHeader title={page.title} description={page.description} />;

  if (!properties || !units || !leases || !loans || !transactions || !tenants) {
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
  const occupancy = occupancyRate(
    units.filter((u) => ownedIds.has(u.propertyId)),
    leases,
    today,
  );
  const performance = portfolioPerformance({ properties, transactions, loans, asOf: now });
  const { total } = performance;
  const baseForecast = portfolioForecast({
    properties,
    units,
    leases,
    transactions,
    loans,
    asOf: now,
    scenario: defaultScenarios.base,
  });
  const ownedLoanCount = loans.filter((l) => ownedIds.has(l.propertyId)).length;
  const k = et.kpi;

  return (
    <>
      {header}

      <section aria-labelledby="key-figures">
        <h2 id="key-figures" className="sr-only">
          {et.dashboard.keyFigures}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={k.portfolioValue}
            value={eur(total.marketValue)}
            hint={k.portfolioHint(owned.length, ratio(occupancy))}
          />
          <KpiCard label={k.equity} value={eur(total.equity)} hint={k.equityHint} />
          <KpiCard
            label={k.totalDebt}
            value={eur(total.loanBalance)}
            hint={k.loanCount(ownedLoanCount)}
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
        <LeaseAlerts
          properties={properties}
          units={units}
          leases={leases}
          tenants={tenants}
          transactions={transactions}
          today={today}
        />
      </div>

      <ChartSection total={total} fifthYear={baseForecast.at(-1)} firstYear={baseForecast[0]} />

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
        {properties.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{et.dashboard.emptyPortfolio}</p>
        ) : (
          <>
            <PropertyTable
              rows={properties.map((p) => ({
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

/*
 * Chart sections: layout and headline figures are in place; the charts themselves are added
 * with the forecast module. Figures come from the same engine as the rest of the dashboard.
 */
function ChartSection({
  total,
  firstYear,
  fifthYear,
}: {
  total: Performance;
  firstYear: { monthlyFreeCashFlow: number } | undefined;
  fifthYear: { loanBalance: number; ltv: number | null } | undefined;
}) {
  const c = et.dashboard.charts;
  return (
    <section aria-labelledby="charts" className="mt-6">
      <h2 id="charts" className="mb-3 text-lg font-semibold text-slate-900">
        {c.title}
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-3"
          icon={<ChartColumn className="size-5" aria-hidden="true" />}
          title={c.cashFlow.title}
          description={c.cashFlow.description}
          stats={[
            [c.cashFlow.trailing, eur(total.freeCashFlow)],
            [c.cashFlow.forecastMonthly, firstYear ? eur(firstYear.monthlyFreeCashFlow) : dash],
          ]}
        />
        <ChartCard
          className="lg:col-span-2"
          icon={<Landmark className="size-5" aria-hidden="true" />}
          title={c.loanBalance.title}
          description={c.loanBalance.description}
          stats={[
            [c.now, eur(total.loanBalance)],
            [c.inFiveYears, fifthYear ? eur(fifthYear.loanBalance) : dash],
          ]}
        />
        <ChartCard
          icon={<ChartLine className="size-5" aria-hidden="true" />}
          title={c.ltv.title}
          description={c.ltv.description}
          stats={[
            [c.now, ratio(total.ltv)],
            [c.inFiveYears, fifthYear ? ratio(fifthYear.ltv) : dash],
          ]}
        />
      </div>
    </section>
  );
}

function ChartCard({
  icon,
  title,
  description,
  stats,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  description: string;
  stats: [string, string][];
  className?: string;
}) {
  const c = et.dashboard.charts;
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-start gap-3">
        <span className="bg-brand-50 text-brand-700 flex size-9 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </span>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="tabular text-lg font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {/* Reserved chart area. */}
      <div className="mt-4 flex min-h-40 flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
        {c.placeholder}
      </div>
      <p className="mt-2 text-xs text-slate-400">{c.scenarioNote}</p>
    </Card>
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
