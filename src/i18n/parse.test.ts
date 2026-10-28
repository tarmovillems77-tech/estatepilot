import { describe, expect, it } from 'vitest';
import { parseNumberInput, parsePercentInput, toNumberInput, toPercentInput } from './parse';

describe('parseNumberInput', () => {
  it('reads Estonian-formatted numbers', () => {
    expect(parseNumberInput('1 234,50')).toBe(1234.5);
    expect(parseNumberInput('480\u00a0000')).toBe(480_000);
    expect(parseNumberInput('-12,5')).toBe(-12.5);
  });

  it('accepts a dot as decimal separator', () => {
    expect(parseNumberInput('3.5')).toBe(3.5);
    expect(parseNumberInput('1.234,5')).toBe(1234.5);
  });

  it('returns undefined for empty input and NaN for text', () => {
    expect(parseNumberInput('  ')).toBeUndefined();
    expect(parseNumberInput('12a')).toBeNaN();
    expect(parseNumberInput('1,2,3')).toBeNaN();
  });
});

describe('percent inputs', () => {
  it('converts between percent text and ratios', () => {
    expect(parsePercentInput('3,5')).toBe(0.035);
    expect(parsePercentInput('0')).toBe(0);
    expect(parsePercentInput('')).toBeUndefined();
    expect(toPercentInput(0.035)).toBe('3,5');
    expect(toPercentInput(0)).toBe('0');
    expect(toPercentInput(null)).toBe('');
  });
});

describe('toNumberInput', () => {
  it('produces editable text with a decimal comma', () => {
    expect(toNumberInput(1234.5)).toBe('1234,5');
    expect(toNumberInput(1 / 3)).toBe('0,33');
    expect(toNumberInput(undefined)).toBe('');
  });
});
