/** Local calendar date → "YYYY-MM-DD" (no UTC shift). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → local Date at midnight (Date.parse would read it as UTC). */
export function fromIsoDate(value: string): Date {
  const [year = NaN, month = NaN, day = NaN] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Adds calendar months, clamping to the last day of the target month (31.01 + 1 → 28.02). */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/** ISO date of the day before `date`, e.g. to turn an exclusive end into an inclusive one. */
export function dayBefore(date: Date): string {
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
}

/** The last 12 full calendar months before `asOf` (inclusive ISO range). */
export function trailingTwelveMonths(asOf: Date): { from: string; to: string } {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  return { from: toIsoDate(addMonths(monthStart, -12)), to: dayBefore(monthStart) };
}

/** Whole days from `from` to `to` (ISO dates); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
