import type { Lease, Loan, Property, Tenant, Transaction, Unit } from '@/domain/types';

/** Everything the ledger tabs read, loaded once by LedgerPage. */
export interface LedgerData {
  properties: Property[];
  units: Unit[];
  leases: Lease[];
  tenants: Tenant[];
  transactions: Transaction[];
  loans: Loan[];
}

export const filterClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none sm:w-auto';
export const thClass = 'px-4 py-3 font-medium whitespace-nowrap';
export const theadClass =
  'border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase';
