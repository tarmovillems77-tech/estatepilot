/*
 * Converting between numbers and Estonian-formatted text inputs ("1 234,5").
 * Used by forms and, later, by CSV/Excel import.
 */

/**
 * "1 234,50" → 1234.5, "" → undefined, "abc" → NaN.
 * Spaces are thousands separators; a comma is the decimal separator. A dot is accepted as
 * decimal separator when there is no comma, and treated as thousands separator otherwise.
 */
export function parseNumberInput(text: string): number | undefined {
  const compact = text.trim().replace(/\s/g, '');
  if (compact === '') return undefined;
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized) ? Number(normalized) : NaN;
}

/** "3,5" → 0.035 (percent text to ratio). */
export function parsePercentInput(text: string): number | undefined {
  const value = parseNumberInput(text);
  return value === undefined ? undefined : roundTo(value / 100, 10);
}

/** 1234.5 → "1234,5" — plain, editable form value without thousands separators. */
export function toNumberInput(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(roundTo(value, maxDecimals)).replace('.', ',');
}

/** 0.035 → "3,5" */
export function toPercentInput(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined ? '' : toNumberInput(ratio * 100, 4);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
