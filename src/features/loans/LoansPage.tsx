import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { store } from '@/data';
import { useLoans, useProperties, useTransactionsInRange } from '@/data/hooks';
import { todayIso, trailingTwelveMonths } from '@/domain/dates';
import { loanPosition, type LoanPosition } from '@/domain/finance/loan';
import type { Performance } from '@/domain/finance/metrics';
import { portfolioPerformance } from '@/domain/finance/portfolio';
import { euriborTenors } from '@/domain/schemas';
import type { EuriborTenor, Loan, Property } from '@/domain/types';
import { formatCurrency, formatDate, formatMultiple, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';
import { parsePercentInput, toPercentInput } from '@/i18n/parse';
import { errorMessage } from '@/i18n/validation';
import { thClass, theadClass } from '@/features/ledger/shared';
import { basisTone, rateLabel, termLabel } from './labels';
import { LoanDialog } from './LoanDialog';

const text = et.loans;
const eur = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';
/** Below this DSCR banks typically start asking questions. */
const DSCR_WARNING = 1.2;

export function LoansPage() {
  const now = new Date();
  const today = todayIso();
  const properties = useProperties();
  const loans = useLoans();
  const transactions = useTransactionsInRange({ from: trailingTwelveMonths(now).from, to: today });
  const [dialogOpen, setDialogOpen] = useState(false);

  const page = et.pages.loans;
  const header = (
    <PageHeader
      title={page.title}
      description={page.description}
      actions={
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {text.add}
        </Button>
      }
    />
  );

  if (!properties || !loans || !transactions) {
    return (
      <>
        {header}
        <p className="text-sm text-slate-500">{et.common.loading}</p>
      </>
    );
  }

  const positions = new Map(loans.map((l) => [l.id, loanPosition(l, today)]));
  const performance = portfolioPerformance({ properties, transactions, loans, asOf: now });
  const { total } = performance;
  const allPositions = [...positions.values()];
  const balance = allPositions.reduce((s, p) => s + p.balance, 0);
  const weightedRate =
    balance > 0
      ? allPositions.reduce((s, p) => s + p.balance * (p.currentRate?.annualRate ?? 0), 0) / balance
      : null;
  const actualCount = allPositions.filter((p) => p.basis !== 'calculated').length;

  return (
    <>
      {header}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={text.kpi.balance}
          value={eur(balance)}
          hint={text.kpi.basis(actualCount, loans.length)}
        />
        <KpiCard
          label={text.kpi.monthlyPayment}
          value={eur(allPositions.reduce((s, p) => s + (p.nextPayment?.payment ?? 0), 0))}
        />
        <KpiCard
          label={text.kpi.averageRate}
          value={weightedRate === null ? dash : formatPercent(weightedRate, 2)}
          hint={text.kpi.averageRateHint}
        />
        <KpiCard
          label={`${text.kpi.dscr} · ${text.kpi.ltv}`}
          value={`${total.dscr === null ? dash : formatMultiple(total.dscr)} · ${
            total.ltv === null ? dash : formatPercent(total.ltv)
          }`}
          tone={total.dscr !== null && total.dscr < DSCR_WARNING ? 'warning' : 'default'}
        />
      </div>

      <EuriborRates loans={loans} />

      <CoverageTable properties={properties} performance={performance} />

      <LoanList loans={loans} properties={properties} positions={positions} />

      <LoanDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

function EuriborRates({ loans }: { loans: Loan[] }) {
  const current = (tenor: EuriborTenor) =>
    loans.find((l) => l.rateType === 'euribor' && l.euriborTenor === tenor);
  const [rates, setRates] = useState<Record<EuriborTenor, string>>(() => {
    const value = (tenor: EuriborTenor) => {
      const loan = current(tenor);
      return loan?.rateType === 'euribor' ? toPercentInput(loan.euribor) : '';
    };
    return { '3M': value('3M'), '6M': value('6M') };
  });
  const [message, setMessage] = useState<string | null>(null);

  async function apply(tenor: EuriborTenor) {
    const rate = parsePercentInput(rates[tenor]);
    if (rate === undefined || Number.isNaN(rate)) {
      setMessage(et.validation.number);
      return;
    }
    const targets = loans.filter((l) => l.rateType === 'euribor' && l.euriborTenor === tenor);
    try {
      for (const loan of targets) await store.loans.update(loan.id, { euribor: rate });
      setMessage(text.rates.applied(targets.length));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold text-slate-900">{text.rates.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{text.rates.intro}</p>
      <div className="mt-4 flex flex-wrap gap-6">
        {euriborTenors.map((tenor) => {
          const count = loans.filter(
            (l) => l.rateType === 'euribor' && l.euriborTenor === tenor,
          ).length;
          return (
            <div key={tenor} className="flex items-end gap-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  {et.labels.euriborTenor[tenor]}{' '}
                  <span className="font-normal text-slate-500">
                    ({text.rates.loansUsing(count)})
                  </span>
                </span>
                <span className="relative block w-32">
                  <input
                    inputMode="decimal"
                    value={rates[tenor]}
                    onChange={(e) => setRates((r) => ({ ...r, [tenor]: e.target.value }))}
                    className="focus:border-brand-600 w-full rounded-lg border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
                    %
                  </span>
                </span>
              </label>
              <Button variant="secondary" onClick={() => apply(tenor)} disabled={count === 0}>
                {text.rates.apply}
              </Button>
            </div>
          );
        })}
      </div>
      {message && (
        <p className="mt-3 text-sm text-slate-700" role="status">
          {message}
        </p>
      )}
    </Card>
  );
}

function CoverageTable({
  properties,
  performance,
}: {
  properties: Property[];
  performance: ReturnType<typeof portfolioPerformance>;
}) {
  const c = text.columns;
  const td = 'tabular px-4 py-2.5 text-right whitespace-nowrap';
  const owned = properties.filter((p) => p.status === 'owned');
  const row = (key: string, label: ReactNode, p: Performance, strong = false) => (
    <tr key={key} className={strong ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50'}>
      <td className="px-4 py-2.5">{label}</td>
      <td className={td}>{eur(p.loanBalance)}</td>
      <td className={td}>{p.marketValue > 0 ? eur(p.marketValue) : dash}</td>
      <td className={td}>{p.ltv === null ? dash : formatPercent(p.ltv)}</td>
      <td className={td}>{p.marketValue > 0 || strong ? eur(p.noi) : dash}</td>
      <td className={td}>{eur(p.debtService)}</td>
      <td className={`${td} ${p.dscr !== null && p.dscr < DSCR_WARNING ? 'text-amber-700' : ''}`}>
        {p.dscr === null || (!strong && p.marketValue === 0) ? dash : formatMultiple(p.dscr)}
      </td>
    </tr>
  );

  return (
    <Card flush className="mt-6">
      <h2 className="px-5 pt-5 text-lg font-semibold text-slate-900">{text.coverageTitle}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>{c.property}</th>
              <th className={`${thClass} text-right`}>{c.balance}</th>
              <th className={`${thClass} text-right`}>{c.marketValue}</th>
              <th className={`${thClass} text-right`}>{c.ltv}</th>
              <th className={`${thClass} text-right`}>{c.noi}</th>
              <th className={`${thClass} text-right`}>{c.debtService}</th>
              <th className={`${thClass} text-right`}>{c.dscr}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {owned.map((property) => {
              const p = performance.byProperty.get(property.id);
              return p
                ? row(
                    property.id,
                    <Link
                      to={`/kinnisvara/${property.id}`}
                      className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                    >
                      {property.name}
                    </Link>,
                    p,
                  )
                : null;
            })}
            {performance.portfolioLoans &&
              row(
                'portfolio-loans',
                <span className="text-slate-700">{text.portfolioLoansRow}</span>,
                performance.portfolioLoans,
              )}
            {row('total', text.total, performance.total, true)}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-slate-500">
        {text.coverageNote(formatDate(performance.period.from), formatDate(performance.period.to))}
      </p>
    </Card>
  );
}

function LoanList({
  loans,
  properties,
  positions,
}: {
  loans: Loan[];
  properties: Property[];
  positions: Map<string, LoanPosition>;
}) {
  const c = text.columns;
  const propertyName = new Map(properties.map((p) => [p.id, p.name]));
  const td = 'tabular px-4 py-3 text-right whitespace-nowrap';

  return (
    <Card flush className="mt-6">
      {loans.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">{text.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>{c.lender}</th>
                <th className={thClass}>{c.property}</th>
                <th className={thClass}>{c.rate}</th>
                <th className={thClass}>{c.term}</th>
                <th className={`${thClass} text-right`}>{c.payment}</th>
                <th className={`${thClass} text-right`}>{c.balance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loans.map((loan) => {
                const position = positions.get(loan.id);
                return (
                  <tr key={loan.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/laenud/${loan.id}`}
                        className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                      >
                        {loan.lender}
                      </Link>
                      {loan.reference && <p className="text-xs text-slate-500">{loan.reference}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {loan.propertyId === null ? (
                        <StatusBadge tone="slate">{text.portfolioShort}</StatusBadge>
                      ) : (
                        (propertyName.get(loan.propertyId) ?? dash)
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {position?.currentRate
                        ? rateLabel(
                            position.currentRate,
                            loan.rateType === 'euribor' ? loan.euriborTenor : undefined,
                          )
                        : dash}
                      <p className="text-xs text-slate-500">{et.labels.dayCount[loan.dayCount]}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {termLabel(loan.termMonths)}
                      <p className="text-xs text-slate-500">
                        {et.labels.repaymentType[loan.repaymentType]}
                      </p>
                    </td>
                    <td className={td}>
                      {position?.nextPayment ? eur(position.nextPayment.payment) : dash}
                    </td>
                    <td className={td}>
                      <p className="font-medium text-slate-900">
                        {position ? eur(position.balance) : dash}
                      </p>
                      {position && (
                        <StatusBadge tone={basisTone[position.basis]}>
                          {text.basis[position.basis]}
                        </StatusBadge>
                      )}
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
