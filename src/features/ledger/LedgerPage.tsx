import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  useLeases,
  useLoans,
  useProperties,
  useTenants,
  useTransactions,
  useUnits,
} from '@/data/hooks';
import { et } from '@/i18n/et';
import { RentTab } from './RentTab';
import type { LedgerData } from './shared';
import { SummaryTab } from './SummaryTab';
import { TransactionsTab } from './TransactionsTab';

/** URL values: /tulud-kulud (rent), ?vaade=tehingud, ?vaade=kokkuvote */
const views = { rent: '', transactions: 'tehingud', summary: 'kokkuvote' } as const;
type Tab = keyof typeof views;

export function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('vaade') ?? '';
  const tab = (Object.keys(views) as Tab[]).find((t) => views[t] === view) ?? 'rent';

  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const tenants = useTenants();
  const transactions = useTransactions();
  const loans = useLoans();

  const page = et.pages.transactions;
  const header = <PageHeader title={page.title} description={page.description} />;

  if (!properties || !units || !leases || !tenants || !transactions || !loans) {
    return (
      <>
        {header}
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      </>
    );
  }
  const data: LedgerData = { properties, units, leases, tenants, transactions, loans };

  return (
    <>
      {header}
      <div className="mb-6 flex gap-6 overflow-x-auto border-b border-slate-200" role="tablist">
        {(Object.keys(views) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(views[t] ? { vaade: views[t] } : {})}
            className={`border-b-2 px-1 pb-3 text-sm font-medium whitespace-nowrap ${
              tab === t
                ? 'border-brand-700 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {et.ledger.tabs[t]}
          </button>
        ))}
      </div>
      {tab === 'rent' && <RentTab data={data} />}
      {tab === 'transactions' && <TransactionsTab data={data} />}
      {tab === 'summary' && <SummaryTab data={data} />}
    </>
  );
}
