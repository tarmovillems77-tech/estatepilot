import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { store } from '@/data';
import { useLoan, useProperties } from '@/data/hooks';
import { todayIso } from '@/domain/dates';
import {
  amortizationSchedule,
  loanPosition,
  standardTermYears,
  yearlySchedule,
} from '@/domain/finance/loan';
import {
  compareRefinancing,
  compareTerms,
  defaultRefinanceTerms,
  type LoanOutcome,
  type RefinanceTerms,
} from '@/domain/finance/refinance';
import { euriborTenors } from '@/domain/schemas';
import type { EuriborTenor, Loan } from '@/domain/types';
import { formatCurrency, formatDate, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';
import { parseNumberInput, parsePercentInput, toNumberInput, toPercentInput } from '@/i18n/parse';
import { errorMessage } from '@/i18n/validation';
import { thClass, theadClass } from '@/features/ledger/shared';
import { basisTone, rateLabel, termLabel } from './labels';
import { LoanDialog } from './LoanDialog';

const text = et.loans;
const d = text.detail;
const eur = (value: number) => formatCurrency(value);
const eurWhole = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';
const tenorOf = (loan: Loan) => (loan.rateType === 'euribor' ? loan.euriborTenor : undefined);

export function LoanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const loan = useLoan(id);
  const properties = useProperties();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = (
    <Link
      to="/laenud"
      className="hover:text-brand-700 mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {text.back}
    </Link>
  );

  if (loan === null) {
    return (
      <>
        {back}
        <p className="text-sm text-slate-600">{text.notFound}</p>
      </>
    );
  }
  if (!loan || !properties) return <p className="text-sm text-slate-500">{et.common.loading}</p>;

  const property = properties.find((p) => p.id === loan.propertyId);

  async function remove(target: Loan) {
    if (!window.confirm(text.deleteConfirm(target.lender))) return;
    try {
      await store.loans.remove(target.id);
      navigate('/laenud');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      {back}
      <PageHeader
        title={loan.lender}
        description={[property ? property.name : text.portfolio, loan.reference]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden="true" />
              {text.edit}
            </Button>
            <Button variant="danger" onClick={() => remove(loan)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {text.delete}
            </Button>
          </>
        }
      />
      {error && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <PositionCard loan={loan} />
        <TermsCard loan={loan} />
      </div>
      <TermComparison loan={loan} />
      <RefinanceScenario key={loan.id + loan.updatedAt} loan={loan} />
      <Schedule loan={loan} />

      <LoanDialog open={editing} onClose={() => setEditing(false)} loan={loan} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tabular text-right text-slate-900">{children}</dd>
    </div>
  );
}

function PositionCard({ loan }: { loan: Loan }) {
  const position = loanPosition(loan, todayIso());
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{d.positionTitle}</h2>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <p className="tabular text-3xl font-semibold text-slate-900">{eur(position.balance)}</p>
        <StatusBadge tone={basisTone[position.basis]}>{text.basis[position.basis]}</StatusBadge>
      </div>
      <p className="mt-1 text-xs text-slate-500">{text.basisHelp[position.basis]}</p>

      <dl className="mt-4">
        {position.actual ? (
          <>
            <Fact label={`${text.fields.actualAmount} (${formatDate(position.actual.date)})`}>
              {eur(position.actual.amount)}
            </Fact>
            <Fact label={d.calculatedAtActual(formatDate(position.actual.date))}>
              {position.calculatedAtActualDate === null
                ? dash
                : eur(position.calculatedAtActualDate)}
            </Fact>
            <Fact label={d.difference}>
              {position.difference === null
                ? dash
                : `${position.difference > 0 ? '+' : ''}${eur(position.difference)}`}
            </Fact>
          </>
        ) : (
          <p className="py-2 text-sm text-slate-500">{d.noActual}</p>
        )}
        <Fact label={d.currentRate}>
          {position.currentRate ? rateLabel(position.currentRate, tenorOf(loan)) : dash}
        </Fact>
        <Fact label={d.nextPayment}>
          {position.nextPayment
            ? `${formatDate(position.nextPayment.date)} · ${eur(position.nextPayment.payment)}`
            : dash}
        </Fact>
        {position.nextPayment && (
          <Fact label={`${text.columnsSchedule.principal} / ${text.columnsSchedule.interest}`}>
            {eur(position.nextPayment.principal)} / {eur(position.nextPayment.interest)}
          </Fact>
        )}
        <Fact label={text.columns.term}>
          {d.payments(position.paymentsMade, position.paymentsLeft)}
        </Fact>
        <Fact label={d.endDate}>{position.endDate ? formatDate(position.endDate) : dash}</Fact>
      </dl>
    </Card>
  );
}

function TermsCard({ loan }: { loan: Loan }) {
  const f = text.fields;
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{d.terms}</h2>
      <dl className="mt-3">
        <Fact label={f.principal}>{eur(loan.principal)}</Fact>
        <Fact label={f.startDate}>{formatDate(loan.startDate)}</Fact>
        <Fact label={f.termPreset}>{termLabel(loan.termMonths)}</Fact>
        <Fact label={f.repaymentType}>{et.labels.repaymentType[loan.repaymentType]}</Fact>
        <Fact label={f.rateType}>{et.labels.rateType[loan.rateType]}</Fact>
        {loan.rateType === 'euribor' ? (
          <>
            <Fact label={f.euriborTenor}>{et.labels.euriborTenor[loan.euriborTenor]}</Fact>
            <Fact label={f.euribor}>{formatPercent(loan.euribor, 2)}</Fact>
            <Fact label={f.margin}>{formatPercent(loan.margin, 2)}</Fact>
          </>
        ) : (
          <Fact label={f.fixedRate}>{formatPercent(loan.fixedRate, 2)}</Fact>
        )}
        <Fact label={f.dayCount}>{et.labels.dayCount[loan.dayCount]}</Fact>
      </dl>
      {loan.notes && <p className="mt-3 text-sm text-slate-600">{loan.notes}</p>}
    </Card>
  );
}

function TermComparison({ loan }: { loan: Loan }) {
  const options = compareTerms(loan);
  const td = 'tabular px-4 py-2.5 text-right whitespace-nowrap';
  return (
    <Card flush className="mt-6">
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">{d.termsTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{d.termsIntro}</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>{text.columns.term}</th>
              <th className={`${thClass} text-right`}>{text.columns.payment}</th>
              <th className={`${thClass} text-right`}>{d.totalInterest}</th>
              <th className={`${thClass} text-right`}>{d.totalPaid}</th>
              <th className={`${thClass} text-right`}>{d.endDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {options.map((o) => {
              const current = o.years * 12 === loan.termMonths;
              return (
                <tr key={o.years} className={current ? 'bg-brand-50' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {text.years(o.years)}
                    {current && (
                      <span className="text-brand-700 ml-2 text-xs font-normal">({d.current})</span>
                    )}
                  </td>
                  <td className={td}>{eur(o.monthlyPayment)}</td>
                  <td className={td}>{eurWhole(o.totalInterest)}</td>
                  <td className={td}>{eurWhole(o.totalPaid)}</td>
                  <td className={td}>{formatDate(o.endDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RefinanceScenario({ loan }: { loan: Loan }) {
  const defaults = defaultRefinanceTerms(loan, todayIso());
  const r = text.refinance;
  const [inputs, setInputs] = useState({
    month: defaults.atDate.slice(0, 7),
    termMonths: String(defaults.termMonths),
    margin: toPercentInput(defaults.margin),
    euribor: toPercentInput(defaults.euribor),
    tenor: defaults.euriborTenor as EuriborTenor,
    fees: toNumberInput(defaults.fees),
  });

  const valid = (value: number | undefined, fallback: number) =>
    value === undefined || Number.isNaN(value) ? fallback : value;
  const terms: RefinanceTerms = {
    atDate: inputs.month ? `${inputs.month}-01` : defaults.atDate,
    termMonths: Number(inputs.termMonths),
    repaymentType: defaults.repaymentType,
    euriborTenor: inputs.tenor,
    margin: valid(parsePercentInput(inputs.margin), defaults.margin),
    euribor: valid(parsePercentInput(inputs.euribor), defaults.euribor),
    fees: valid(parseNumberInput(inputs.fees), 0),
  };
  const result = compareRefinancing(loan, terms);
  const set = (key: keyof typeof inputs) => (e: { target: { value: string } }) =>
    setInputs((current) => ({ ...current, [key]: e.target.value }));

  const field =
    'focus:border-brand-600 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none';
  const label = 'block text-sm font-medium text-slate-700';

  const rows: [string, (o: LoanOutcome) => string][] = [
    [r.rows.balance, (o) => eurWhole(o.balanceAtRefinance)],
    [
      r.rows.rate,
      (o) =>
        rateLabel(
          { euribor: o.euribor, margin: o.margin, annualRate: o.annualRate },
          o === result.refinanced ? terms.euriborTenor : tenorOf(loan),
        ),
    ],
    [r.rows.payment, (o) => eur(o.firstPayment)],
    [r.rows.interestFiveYears, (o) => eurWhole(o.interestFiveYears)],
    [r.rows.interestToEnd, (o) => eurWhole(o.interestToEnd)],
    [r.rows.fees, (o) => (o.fees > 0 ? eurWhole(o.fees) : dash)],
    [r.rows.endDate, (o) => (o.endDate ? formatDate(o.endDate) : dash)],
  ];

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold text-slate-900">{d.refinanceTitle}</h2>
      <p className="mt-1 text-sm text-slate-600">{d.refinanceIntro}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className={label}>
          {r.atDate}
          <input
            type="month"
            value={inputs.month}
            onChange={set('month')}
            className={`${field} mt-1`}
          />
        </label>
        <label className={label}>
          {r.termYears}
          <select
            value={inputs.termMonths}
            onChange={set('termMonths')}
            className={`${field} mt-1`}
          >
            <option value={defaults.termMonths}>
              {r.remainingTerm(termLabel(defaults.termMonths))}
            </option>
            {[10, 15, ...standardTermYears]
              .filter((y) => y * 12 !== defaults.termMonths)
              .map((y) => (
                <option key={y} value={y * 12}>
                  {text.years(y)}
                </option>
              ))}
          </select>
        </label>
        <label className={label}>
          {r.margin}
          <input
            inputMode="decimal"
            value={inputs.margin}
            onChange={set('margin')}
            className={`${field} mt-1`}
          />
        </label>
        <label className={label}>
          {r.euribor}
          <input
            inputMode="decimal"
            value={inputs.euribor}
            onChange={set('euribor')}
            className={`${field} mt-1`}
          />
        </label>
        <label className={label}>
          {r.euriborTenor}
          <select value={inputs.tenor} onChange={set('tenor')} className={`${field} mt-1`}>
            {euriborTenors.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {r.fees}
          <input
            inputMode="decimal"
            value={inputs.fees}
            onChange={set('fees')}
            className={`${field} mt-1`}
          />
        </label>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>{d.scenario}</th>
              <th className={`${thClass} text-right`}>{d.currentLoan}</th>
              <th className={`${thClass} text-right`}>{d.refinancedLoan}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([title, value]) => (
              <tr key={title}>
                <td className="px-4 py-2.5 text-slate-600">{title}</td>
                <td className="tabular px-4 py-2.5 text-right">{value(result.current)}</td>
                <td className="tabular px-4 py-2.5 text-right">{value(result.refinanced)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm font-medium">
        <p className={result.savingToEnd >= 0 ? 'text-brand-700' : 'text-amber-700'}>
          {result.savingToEnd >= 0
            ? d.saving(eurWhole(result.savingToEnd))
            : d.extraCost(eurWhole(-result.savingToEnd))}
        </p>
        <p className="text-slate-700">
          {result.paymentChange >= 0
            ? d.paymentLower(eur(result.paymentChange))
            : d.paymentHigher(eur(-result.paymentChange))}
        </p>
      </div>
    </Card>
  );
}

function Schedule({ loan }: { loan: Loan }) {
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly');
  const today = todayIso();
  const rows = amortizationSchedule(loan);
  const c = text.columnsSchedule;
  const td = 'tabular px-3 py-2 text-right whitespace-nowrap';
  const toggle = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <Card flush className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">{d.scheduleTitle}</h2>
        <div className="flex gap-1" role="group">
          <button
            type="button"
            className={toggle(view === 'yearly')}
            onClick={() => setView('yearly')}
            aria-pressed={view === 'yearly'}
          >
            {d.scheduleYearly}
          </button>
          <button
            type="button"
            className={toggle(view === 'monthly')}
            onClick={() => setView('monthly')}
            aria-pressed={view === 'monthly'}
          >
            {d.scheduleMonthly}
          </button>
        </div>
      </div>
      <p className="px-5 pt-1 text-xs text-slate-500">{d.scheduleNote}</p>

      <div className="mt-4 max-h-[36rem] overflow-auto">
        {view === 'yearly' ? (
          <table className="w-full text-left text-sm">
            <thead className={`${theadClass} sticky top-0`}>
              <tr>
                <th className={thClass}>{c.year}</th>
                <th className={`${thClass} text-right`}>{c.payment}</th>
                <th className={`${thClass} text-right`}>{c.principal}</th>
                <th className={`${thClass} text-right`}>{c.interest}</th>
                <th className={`${thClass} text-right`}>{c.balance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {yearlySchedule(rows).map((y) => (
                <tr
                  key={y.year}
                  className={y.year < today.slice(0, 4) ? 'text-slate-400' : 'text-slate-900'}
                >
                  <td className="px-3 py-2 font-medium">{y.year}</td>
                  <td className={td}>{eurWhole(y.payment)}</td>
                  <td className={td}>{eurWhole(y.principal)}</td>
                  <td className={td}>{eurWhole(y.interest)}</td>
                  <td className={td}>{eurWhole(y.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className={`${theadClass} sticky top-0`}>
              <tr>
                <th className={thClass}>{c.date}</th>
                <th className={`${thClass} text-right`}>{c.days}</th>
                <th className={`${thClass} text-right`}>{c.rate}</th>
                <th className={`${thClass} text-right`}>{c.payment}</th>
                <th className={`${thClass} text-right`}>{c.principal}</th>
                <th className={`${thClass} text-right`}>{c.interest}</th>
                <th className={`${thClass} text-right`}>{c.interestEuribor}</th>
                <th className={`${thClass} text-right`}>{c.interestMargin}</th>
                <th className={`${thClass} text-right`}>{c.balance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr
                  key={row.period}
                  className={
                    row.startsFromActual
                      ? 'bg-brand-50 text-slate-900'
                      : row.date <= today
                        ? 'text-slate-400'
                        : 'text-slate-900'
                  }
                >
                  <td className="tabular px-3 py-2 whitespace-nowrap">
                    {formatDate(row.date)}
                    {row.startsFromActual && (
                      <span className="ml-2">
                        <StatusBadge tone="brand">{text.basis.actual}</StatusBadge>
                      </span>
                    )}
                  </td>
                  <td className={td}>{row.days}</td>
                  <td className={td}>{formatPercent(row.annualRate, 2)}</td>
                  <td className={td}>{eur(row.payment)}</td>
                  <td className={td}>{eur(row.principal)}</td>
                  <td className={td}>{eur(row.interest)}</td>
                  <td className={td}>{row.euribor === null ? dash : eur(row.interestEuribor)}</td>
                  <td className={td}>{row.margin === null ? dash : eur(row.interestMargin)}</td>
                  <td className={td}>{eur(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
