import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { todayIso } from '@/domain/dates';
import { loanPosition } from '@/domain/finance/loan';
import type { Loan } from '@/domain/types';
import { formatCurrency } from '@/i18n/format';
import { et } from '@/i18n/et';
import { basisTone, rateLabel } from './labels';
import { LoanDialog } from './LoanDialog';

const text = et.loans;

/** Loans of one property, shown on the property page. */
export function PropertyLoansCard({ propertyId, loans }: { propertyId: string; loans: Loan[] }) {
  const [adding, setAdding] = useState(false);
  const today = todayIso();

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{et.nav.loans}</h2>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {text.add}
        </Button>
      </div>
      {loans.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{text.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {loans.map((loan) => {
            const position = loanPosition(loan, today);
            return (
              <li key={loan.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link
                    to={`/laenud/${loan.id}`}
                    className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                  >
                    {loan.lender}
                    {loan.reference && ` · ${loan.reference}`}
                  </Link>
                  <p className="text-slate-500">
                    {position.currentRate
                      ? rateLabel(
                          position.currentRate,
                          loan.rateType === 'euribor' ? loan.euriborTenor : undefined,
                        )
                      : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular font-semibold text-slate-900">
                    {formatCurrency(position.balance, { whole: true })}
                  </p>
                  <StatusBadge tone={basisTone[position.basis]}>
                    {text.basis[position.basis]}
                  </StatusBadge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <LoanDialog open={adding} onClose={() => setAdding(false)} propertyId={propertyId} />
    </Card>
  );
}
