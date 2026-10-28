import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatMultiple, formatNumber, formatPercent } from './format';

// Intl uses non-breaking spaces as separators; normalise them for readable assertions.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatCurrency', () => {
  it('uses a space as thousands separator, a decimal comma and a trailing euro sign', () => {
    expect(plain(formatCurrency(12345.5))).toBe('12 345,50 €');
  });

  it('groups four-digit amounts too, so money columns line up', () => {
    expect(plain(formatCurrency(1234.5))).toBe('1 234,50 €');
  });

  it('can drop the cents', () => {
    expect(plain(formatCurrency(250000, { whole: true }))).toBe('250 000 €');
  });

  it('formats negative amounts', () => {
    expect(plain(formatCurrency(-89.9))).toMatch(/^[-−]89,90 €$/);
  });
});

describe('formatNumber', () => {
  it('rounds to the requested precision', () => {
    expect(plain(formatNumber(12345.678))).toBe('12 345,68');
    expect(plain(formatNumber(52.4, 0))).toBe('52');
  });
});

describe('formatPercent', () => {
  it('converts a ratio to a percentage with a decimal comma', () => {
    expect(plain(formatPercent(0.052))).toMatch(/^5,2 ?%$/);
    expect(plain(formatPercent(0.65, 0))).toMatch(/^65 ?%$/);
  });
});

describe('formatMultiple', () => {
  it('formats coverage ratios', () => {
    expect(formatMultiple(1.234)).toBe('1,23×');
  });
});

describe('formatDate', () => {
  it('formats dates as dd.mm.yyyy', () => {
    expect(formatDate(new Date(2026, 9, 28))).toBe('28.10.2026');
  });

  it('reads ISO date strings as local dates', () => {
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
  });
});
