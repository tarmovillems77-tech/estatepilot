import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { expenseCategories, expenseGroupOf, expenseGroups } from '@/domain/categories';
import { todayIso } from '@/domain/dates';
import { totalsByCategory, yearStatements, type PeriodStatement } from '@/domain/finance/ledger';
import { formatCurrency, formatDate, formatMonth, formatPercent } from '@/i18n/format';
import { et } from '@/i18n/et';
import { filterClass, thClass, theadClass, type LedgerData } from './shared';

const text = et.ledger.summary;
const eur = (value: number) => formatCurrency(value, { whole: true });

const columns = [
  'rentalIncome',
  'otherIncome',
  'operatingExpenses',
  'noi',
  'capex',
  'debtService',
  'cashFlow',
] as const;

export function SummaryTab({ data }: { data: LedgerData }) {
  const currentYear = todayIso().slice(0, 4);
  const [year, setYear] = useState(currentYear);
  const [propertyId, setPropertyId] = useState('');

  const owned = data.properties.filter((p) => p.status === 'owned');
  const scope = propertyId ? owned.filter((p) => p.id === propertyId) : owned;
  const scopeIds = new Set(scope.map((p) => p.id));
  const transactions = data.transactions.filter((t) => scopeIds.has(t.propertyId));
  // The whole portfolio also carries portfolio-level loans.
  const loans = data.loans.filter((l) =>
    l.propertyId === null ? !propertyId : scopeIds.has(l.propertyId),
  );
  const today = todayIso();
  const { months, total } = yearStatements({
    transactions,
    loans,
    year: Number(year),
    asOf: today,
  });

  const years = [...new Set([currentYear, ...data.transactions.map((t) => t.date.slice(0, 4))])]
    .sort()
    .reverse();
  const yearTransactions = transactions.filter((t) => t.date.startsWith(`${year}-`));
  const { expenses } = totalsByCategory(yearTransactions);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className={filterClass}
          aria-label={text.year}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className={filterClass}
          aria-label={text.wholePortfolio}
        >
          <option value="">{text.wholePortfolio}</option>
          {owned.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <Card flush>
        <h2 className="px-5 pt-5 text-lg font-semibold text-slate-900">{text.monthlyTitle}</h2>
        <StatementTable
          firstColumn={text.columns.period}
          rows={months.map((m) => ({ key: m.period, label: formatMonth(m.period), statement: m }))}
          total={total}
        />
        <div className="space-y-1 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <p>{text.note}</p>
          {year === currentYear && <p>{text.toDate(formatDate(today))}</p>}
          <p>{text.reconciliation(eur(total.recordedLoanPayments), eur(total.debtService))}</p>
        </div>
      </Card>

      {!propertyId && (
        <Card flush>
          <h2 className="px-5 pt-5 text-lg font-semibold text-slate-900">{text.byPropertyTitle}</h2>
          <StatementTable
            firstColumn={text.columns.property}
            rows={owned.map((p) => ({
              key: p.id,
              label: (
                <Link
                  to={`/kinnisvara/${p.id}`}
                  className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                >
                  {p.name}
                </Link>
              ),
              statement: yearStatements({
                transactions: transactions.filter((t) => t.propertyId === p.id),
                loans: loans.filter((l) => l.propertyId === p.id),
                year: Number(year),
                asOf: today,
              }).total,
            }))}
            total={total}
          />
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{text.byCategoryTitle}</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {expenseGroups.map((group) => {
            const categories = expenseCategories.filter((c) => expenseGroupOf[c] === group);
            const groupTotal = categories.reduce((s, c) => s + (expenses.get(c) ?? 0), 0);
            return (
              <section key={group}>
                <h3 className="flex justify-between text-sm font-semibold text-slate-900">
                  <span>{et.labels.expenseGroup[group]}</span>
                  <span className="tabular">{eur(groupTotal)}</span>
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {categories.map((c) => {
                    const amount = expenses.get(c) ?? 0;
                    return (
                      <li key={c} className="flex justify-between gap-3 text-slate-600">
                        <span>{et.labels.expenseCategory[c]}</span>
                        <span className="tabular whitespace-nowrap">
                          {eur(amount)}
                          {group === 'operating' && groupTotal > 0 && (
                            <span className="ml-2 text-xs text-slate-400">
                              {formatPercent(amount / groupTotal, 0)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StatementTable({
  firstColumn,
  rows,
  total,
}: {
  firstColumn: string;
  rows: { key: string; label: ReactNode; statement: PeriodStatement }[];
  total: PeriodStatement;
}) {
  const td = 'tabular px-4 py-2.5 text-right whitespace-nowrap';
  const cell = (s: PeriodStatement, column: (typeof columns)[number]) => {
    if (s.future) {
      return (
        <td key={column} className={`${td} text-slate-300`}>
          —
        </td>
      );
    }
    const value = s[column];
    const emphasis = column === 'noi' || column === 'cashFlow' ? 'font-semibold' : '';
    const negative = value < 0 ? 'text-red-700' : '';
    return (
      <td key={column} className={`${td} ${emphasis} ${negative}`}>
        {value === 0 ? '—' : eur(value)}
      </td>
    );
  };

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className={theadClass}>
          <tr>
            <th className={thClass}>{firstColumn}</th>
            {columns.map((c) => (
              <th key={c} className={`${thClass} text-right`}>
                {text.columns[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-slate-50">
              <td
                className={`px-4 py-2.5 whitespace-nowrap ${row.statement.future ? 'text-slate-400' : 'text-slate-700'}`}
              >
                {row.label}
              </td>
              {columns.map((c) => cell(row.statement, c))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50">
          <tr>
            <th scope="row" className="px-4 py-2.5 font-semibold text-slate-900">
              {text.total}
            </th>
            {columns.map((c) => cell(total, c))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
