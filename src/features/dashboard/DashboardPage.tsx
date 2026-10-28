import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { et } from '@/i18n/et';

// Values are filled in once the data layer (step 2) and finance engine (step 3) exist.
const kpis = [
  et.kpi.portfolioValue,
  et.kpi.totalDebt,
  et.kpi.ltv,
  et.kpi.monthlyNoi,
  et.kpi.monthlyFreeCashFlow,
  et.kpi.occupancy,
];

export function DashboardPage() {
  const page = et.pages.dashboard;

  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((label) => (
          <KpiCard key={label} label={label} value="—" hint={et.common.noData} />
        ))}
      </div>
    </>
  );
}
