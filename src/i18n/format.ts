const LOCALE = 'et-EE';
const CURRENCY = 'EUR';

// et-EE leaves 4-digit numbers ungrouped (1234); always grouping keeps money columns aligned.
const GROUPING = 'always';

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  useGrouping: GROUPING,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  useGrouping: GROUPING,
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 1234.5 → "1 234,50 €" */
export function formatCurrency(value: number, options: { whole?: boolean } = {}): string {
  return (options.whole ? wholeCurrencyFormatter : currencyFormatter).format(value);
}

/** 12345.678 → "12 345,68" */
export function formatNumber(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, {
    useGrouping: GROUPING,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Ratio in, percent out: 0.052 → "5,2%" */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

const monthFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });

/** "2026-03" → "märts 2026" */
export function formatMonth(month: string): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  return monthFormatter.format(new Date(year, monthNumber - 1, 1));
}

/** 48 → "48 m²", 47.5 → "47,5 m²" */
export function formatArea(value: number): string {
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}\u00a0m²`;
}

/** Coverage ratios such as DSCR: 1.234 → "1,23×" */
export function formatMultiple(value: number, fractionDigits = 2): string {
  return `${formatNumber(value, fractionDigits)}×`;
}

/**
 * Date or ISO date string ("2026-10-28") → "28.10.2026".
 * ISO date strings are read as local calendar dates so they never shift by a day.
 */
export function formatDate(value: Date | string): string {
  return dateFormatter.format(typeof value === 'string' ? parseIsoDate(value) : value);
}

function parseIsoDate(value: string): Date {
  const match = ISO_DATE.exec(value);
  if (!match) return new Date(value);
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}
