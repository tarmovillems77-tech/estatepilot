import { z } from 'zod';
import { StoreError } from '@/data/store';
import { et } from './et';

const v = et.validation;

/** Estonian messages for Zod's built-in checks. Installed once in main.tsx. */
export const estonianErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.input === undefined || issue.input === null || issue.input === '') {
        return v.required;
      }
      if (issue.expected === 'int') return v.integer;
      return issue.expected === 'number' ? v.number : v.invalid;
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'string') return min <= 1 ? v.required : v.invalid;
      if (issue.origin === 'number') {
        if (min === 0) return issue.inclusive ? v.nonNegative : v.positive;
        return v.min(min);
      }
      return v.invalid;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.origin === 'string') return v.tooLong(max);
      return issue.origin === 'number' ? v.max(max) : v.invalid;
    }
    case 'invalid_format':
      if (issue.format === 'date') return v.date;
      if (issue.format === 'email') return v.email;
      return v.invalid;
    case 'invalid_value':
      return v.choose;
    default:
      return v.invalid;
  }
};

export function installEstonianErrors() {
  z.config({ customError: estonianErrorMap });
}

/** Message keys used by custom refinements in the domain schemas. */
const refinementMessages: Record<string, string> = {
  endBeforeStart: v.endBeforeStart,
};

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ValidationResult<T, K extends string> =
  { ok: true; value: T } | { ok: false; errors: FieldErrors<K> };

/**
 * Validates a candidate built from form values and returns the first message per field.
 * Percent fields get a percent-specific range message, because the schema checks ratios (0–1).
 */
export function validateForm<T, K extends string>(
  schema: z.ZodType<T>,
  candidate: unknown,
  percentFields: readonly K[] = [],
): ValidationResult<T, K> {
  const result = schema.safeParse(candidate);
  if (result.success) return { ok: true, value: result.data };

  const errors: FieldErrors<K> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '') as K;
    if (errors[field]) continue;
    const isRange = issue.code === 'too_big' || issue.code === 'too_small';
    errors[field] =
      percentFields.includes(field) && isRange
        ? v.percentRange
        : (refinementMessages[issue.message] ?? issue.message);
  }
  return { ok: false, errors };
}

/** User-facing text for an error thrown by the data layer. */
export function errorMessage(error: unknown): string {
  return error instanceof StoreError ? et.errors[error.code] : et.errors.unknown;
}
