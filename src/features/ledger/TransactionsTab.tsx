import { Download, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { store } from '@/data';
import { expenseGroupOf, type ExpenseGroup } from '@/domain/categories';
import { todayIso } from '@/domain/dates';
import type { Transaction } from '@/domain/types';
import { downloadText } from '@/io/download';
import { categoryLabel, transactionCsvTemplate, transactionsToCsv } from '@/io/transactionsCsv';
import { formatCurrency, formatDate } from '@/i18n/format';
import { et } from '@/i18n/et';
import { errorMessage } from '@/i18n/validation';
import { filterClass, thClass, theadClass, type LedgerData } from './shared';
import { TransactionDialog } from './TransactionDialog';

const text = et.ledger.transactions;
const dash = '—';
type TypeFilter = '' | 'income' | ExpenseGroup;

const groupOf = (t: Transaction): 'income' | ExpenseGroup =>
  t.kind === 'income' ? 'income' : expenseGroupOf[t.category];

export function TransactionsTab({ data }: { data: LedgerData }) {
  const currentYear = todayIso().slice(0, 4);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [type, setType] = useState<TypeFilter>('');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ transaction?: Transaction } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const propertyName = new Map(data.properties.map((p) => [p.id, p.name]));
  const unitName = new Map(data.units.map((u) => [u.id, u.name]));
  const years = [...new Set([currentYear, ...data.transactions.map((t) => t.date.slice(0, 4))])]
    .sort()
    .reverse();
  const needle = query.trim().toLocaleLowerCase('et');

  const rows = data.transactions
    .filter((t) => t.date.startsWith(month ? `${year}-${month}` : year))
    .filter((t) => (propertyId ? t.propertyId === propertyId : true))
    .filter((t) => (type ? groupOf(t) === type : true))
    .filter((t) =>
      needle
        ? [t.description, t.counterparty, t.externalRef].some((v) =>
            v?.toLocaleLowerCase('et').includes(needle),
          )
        : true,
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const income = rows.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = rows.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);

  async function remove(t: Transaction) {
    if (!window.confirm(text.deleteConfirm)) return;
    setError(null);
    try {
      await store.transactions.remove(t.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const exportCsv = () =>
    downloadText(
      `tehingud-${year}${month ? `-${month}` : ''}.csv`,
      transactionsToCsv([...rows].reverse(), data),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4" aria-hidden="true" />
            {text.export}
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadText('tehingute-mall.csv', transactionCsvTemplate())}
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            {text.template}
          </Button>
        </div>
        <Button onClick={() => setDialog({})}>
          <Plus className="size-4" aria-hidden="true" />
          {text.add}
        </Button>
      </div>
      <p className="text-xs text-slate-500">{text.importNote}</p>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

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
              className={`${filterClass} pl-9 sm:w-full`}
            />
          </label>
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
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={filterClass}
            aria-label={et.ledger.rent.month}
          >
            <option value="">{text.allMonths}</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
              <option key={m} value={m}>
                {new Intl.DateTimeFormat('et-EE', { month: 'long' }).format(
                  new Date(2000, Number(m) - 1, 1),
                )}
              </option>
            ))}
          </select>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className={filterClass}
            aria-label={et.ledger.allProperties}
          >
            <option value="">{et.ledger.allProperties}</option>
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
            className={filterClass}
            aria-label={text.fields.kind}
          >
            <option value="">{text.allTypes}</option>
            {(Object.keys(text.typeFilter) as (keyof typeof text.typeFilter)[]).map((k) => (
              <option key={k} value={k}>
                {text.typeFilter[k]}
              </option>
            ))}
          </select>
        </div>

        {rows.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            {data.transactions.length === 0 ? text.empty : text.noMatches}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>{text.columns.date}</th>
                  <th className={thClass}>{text.columns.property}</th>
                  <th className={thClass}>{text.columns.category}</th>
                  <th className={thClass}>{text.columns.description}</th>
                  <th className={`${thClass} text-right`}>{text.columns.amount}</th>
                  <th className={`${thClass} relative`}>
                    <span className="sr-only">{text.columns.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => {
                  const group = groupOf(t);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="tabular px-4 py-2.5 whitespace-nowrap text-slate-600">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-slate-900">{propertyName.get(t.propertyId) ?? dash}</p>
                        {t.unitId && (
                          <p className="text-xs text-slate-500">{unitName.get(t.unitId)}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="whitespace-nowrap text-slate-900">{categoryLabel(t)}</p>
                        {(group === 'capital' || group === 'financing') && (
                          <StatusBadge tone={group === 'capital' ? 'amber' : 'slate'}>
                            {et.labels.expenseGroup[group]}
                          </StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        <p>{t.description ?? dash}</p>
                        {t.counterparty && (
                          <p className="text-xs text-slate-500">{t.counterparty}</p>
                        )}
                      </td>
                      <td
                        className={`tabular px-4 py-2.5 text-right font-medium whitespace-nowrap ${
                          t.kind === 'income' ? 'text-brand-700' : 'text-slate-900'
                        }`}
                      >
                        {t.kind === 'income' ? '+' : '−'}
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDialog({ transaction: t })}
                          className="hover:text-brand-700 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                          aria-label={`${text.edit}: ${formatDate(t.date)} ${t.description ?? ''}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(t)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          aria-label={`${text.delete}: ${formatDate(t.date)} ${t.description ?? ''}`}
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
        <p className="tabular border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
          {text.totals(
            formatCurrency(income),
            formatCurrency(expenses),
            formatCurrency(income - expenses),
          )}
        </p>
      </Card>

      <TransactionDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        transaction={dialog?.transaction}
        propertyId={propertyId || undefined}
      />
    </div>
  );
}
