import type { ExpenseCategory, IncomeCategory } from '@/domain/categories';
import type { Lease, Property, Tenant, TransactionInput, Unit } from '@/domain/types';
import { formatDate } from '@/i18n/format';
import { et } from '@/i18n/et';

/*
 * CSV exchange format for transactions — the contract for exports today and for importing
 * accounting and bank statement files later (Step 11).
 *
 * Excel-friendly Estonian format: ";" separator, decimal comma, dates dd.mm.yyyy, UTF-8 with
 * BOM. Amounts are signed like on a bank statement: income positive, expenses negative.
 */

export const CSV_SEPARATOR = ';';
const BOM = '\uFEFF';

/** Column keys in file order; headings come from et.ts. */
export const transactionCsvColumns = [
  'date',
  'kind',
  'category',
  'property',
  'unit',
  'tenant',
  'periodMonth',
  'amount',
  'description',
  'counterparty',
  'externalRef',
] as const;

export type TransactionCsvColumn = (typeof transactionCsvColumns)[number];

export interface CsvLookups {
  properties: readonly Property[];
  units: readonly Unit[];
  leases: readonly Lease[];
  tenants: readonly Tenant[];
}

/** Quotes a field when it contains the separator, quotes or line breaks. */
export function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 1234.5 → "1234,50"; expenses negative. No thousands separator, so Excel reads it as a number. */
export function csvAmount(t: Pick<TransactionInput, 'kind' | 'amount'>): string {
  const signed = t.kind === 'expense' ? -t.amount : t.amount;
  return signed.toFixed(2).replace('.', ',');
}

/** "2026-03" → "03.2026" */
const csvMonth = (month: string | undefined) =>
  month ? `${month.slice(5, 7)}.${month.slice(0, 4)}` : '';

export function categoryLabel(
  t: { kind: 'income'; category: IncomeCategory } | { kind: 'expense'; category: ExpenseCategory },
): string {
  return t.kind === 'income'
    ? et.labels.incomeCategory[t.category]
    : et.labels.expenseCategory[t.category];
}

export function transactionsToCsv(
  transactions: readonly TransactionInput[],
  lookups: CsvLookups,
): string {
  const property = new Map(lookups.properties.map((p) => [p.id, p.name]));
  const unit = new Map(lookups.units.map((u) => [u.id, u.name]));
  const tenantOfLease = new Map(lookups.leases.map((l) => [l.id, l.tenantId]));
  const tenant = new Map(lookups.tenants.map((t) => [t.id, t.name]));

  const header = transactionCsvColumns.map((c) => et.csv.columns[c]);
  const rows = transactions.map((t) => {
    const tenantId = t.leaseId ? tenantOfLease.get(t.leaseId) : undefined;
    const values: Record<TransactionCsvColumn, string> = {
      date: formatDate(t.date),
      kind: et.labels.transactionKind[t.kind],
      category: categoryLabel(t),
      property: property.get(t.propertyId) ?? '',
      unit: t.unitId ? (unit.get(t.unitId) ?? '') : '',
      tenant: tenantId ? (tenant.get(tenantId) ?? '') : '',
      periodMonth: csvMonth(t.periodMonth),
      amount: csvAmount(t),
      description: t.description ?? '',
      counterparty: t.counterparty ?? '',
      externalRef: t.externalRef ?? '',
    };
    return transactionCsvColumns.map((c) => values[c]);
  });

  return BOM + [header, ...rows].map((r) => r.map(csvField).join(CSV_SEPARATOR)).join('\r\n');
}

/** Empty template with headings and two example rows, for preparing data in Excel. */
export function transactionCsvTemplate(): string {
  const rows = [
    transactionCsvColumns.map((c) => et.csv.columns[c]),
    transactionCsvColumns.map((c) => et.csv.example.income[c]),
    transactionCsvColumns.map((c) => et.csv.example.expense[c]),
  ];
  return BOM + rows.map((r) => r.map(csvField).join(CSV_SEPARATOR)).join('\r\n');
}

/**
 * Identity of a booking for duplicate detection when importing bank statements: the bank's
 * reference when present, otherwise date + signed amount + counterparty.
 */
export function transactionFingerprint(
  t: Pick<TransactionInput, 'date' | 'kind' | 'amount' | 'counterparty' | 'externalRef'>,
): string {
  if (t.externalRef) return `ref:${t.externalRef.trim().toLowerCase()}`;
  const party = (t.counterparty ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${t.date}|${csvAmount(t)}|${party}`;
}

/** Incoming rows whose fingerprint already exists. */
export function findDuplicates<T extends Parameters<typeof transactionFingerprint>[0]>(
  existing: readonly Parameters<typeof transactionFingerprint>[0][],
  incoming: readonly T[],
): T[] {
  const seen = new Set(existing.map(transactionFingerprint));
  return incoming.filter((t) => seen.has(transactionFingerprint(t)));
}
