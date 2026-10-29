import { useState } from 'react';
import { parseNumberInput, toNumberInput, toPercentInput } from '@/i18n/parse';

/**
 * Compact number input for tables of assumptions. Text is edited freely; every keystroke that
 * parses to a valid number is committed, invalid text is marked and not applied.
 * `percent` values are ratios shown as percentages (0.025 ↔ "2,5").
 */
export function ValueInput({
  value,
  onChange,
  label,
  kind = 'number',
  allowEmpty = false,
  min,
  max,
  suffix,
  className = '',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Accessible name; the visible label usually comes from the table. */
  label: string;
  kind?: 'number' | 'percent' | 'integer';
  /** Empty text commits null ("no override"). */
  allowEmpty?: boolean;
  /** Limits in the stored unit (ratios for percent). */
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}) {
  const format = (v: number | null) =>
    kind === 'percent' ? toPercentInput(v) : toNumberInput(v, 4);
  const [text, setText] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);

  const parse = (input: string): number | null | undefined => {
    const parsed = parseNumberInput(input);
    if (parsed === undefined) return allowEmpty ? null : undefined;
    if (Number.isNaN(parsed)) return undefined;
    const stored = kind === 'percent' ? Math.round(parsed * 1e8) / 1e10 : parsed;
    if (kind === 'integer' && !Number.isInteger(stored)) return undefined;
    if (min !== undefined && stored < min) return undefined;
    if (max !== undefined && stored > max) return undefined;
    return stored;
  };

  // Follow outside changes (reset, another set selected) without fighting the user's typing:
  // adjust state during render when the value differs from what the text already means.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    if (parse(text) !== value) {
      setText(format(value));
      setInvalid(false);
    }
  }

  return (
    <span className={`relative inline-block ${className}`}>
      <input
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = parse(e.target.value);
          setInvalid(next === undefined);
          if (next !== undefined) onChange(next);
        }}
        className={`tabular w-full rounded-md border bg-white px-2 py-1 text-right text-sm focus:outline-none ${
          suffix ? 'pr-7' : ''
        } ${invalid ? 'border-red-400 focus:border-red-500' : 'focus:border-brand-600 border-slate-300'}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-500">
          {suffix}
        </span>
      )}
    </span>
  );
}
