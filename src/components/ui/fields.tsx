import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

interface FieldFrameProps {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
}

const controlClass = (invalid: boolean) =>
  `block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:ring-2 disabled:bg-slate-50 ${
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-brand-600 focus:ring-brand-100'
  }`;

/** Label, control, hint and error with the ARIA wiring between them. */
function FieldFrame({
  label,
  error,
  hint,
  className = '',
  children,
}: FieldFrameProps & { children: (ids: { id: string; describedBy?: string }) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({ id, describedBy })}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = FieldFrameProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    /** Unit shown inside the input, e.g. "€" or "%". */
    suffix?: string;
  };

export function TextField({ label, error, hint, className, suffix, ...input }: TextFieldProps) {
  return (
    <FieldFrame label={label} error={error} hint={hint} className={className}>
      {({ id, describedBy }) => (
        <div className="relative">
          <input
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${controlClass(Boolean(error))} ${suffix ? 'pr-10' : ''}`}
            {...input}
          />
          {suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
              {suffix}
            </span>
          )}
        </div>
      )}
    </FieldFrame>
  );
}

/** Text input for Estonian-formatted numbers ("1 234,50"); parse with parseNumberInput. */
export function NumberField(props: TextFieldProps) {
  return <TextField inputMode="decimal" autoComplete="off" {...props} />;
}

interface SelectOption {
  value: string;
  label: string;
}

type SelectFieldProps = FieldFrameProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
    options?: readonly SelectOption[];
    /** Options shown under group headings (<optgroup>), before `options`. */
    groups?: readonly { label: string; options: readonly SelectOption[] }[];
    /** Empty first option, e.g. "Vali üksus". */
    placeholder?: string;
  };

export function SelectField({
  label,
  error,
  hint,
  className,
  options = [],
  groups = [],
  placeholder,
  ...select
}: SelectFieldProps) {
  const renderOption = (option: SelectOption) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  );

  return (
    <FieldFrame label={label} error={error} hint={hint} className={className}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={controlClass(Boolean(error))}
          {...select}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(renderOption)}
            </optgroup>
          ))}
          {options.map(renderOption)}
        </select>
      )}
    </FieldFrame>
  );
}

type TextAreaFieldProps = FieldFrameProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

export function TextAreaField({ label, error, hint, className, ...textarea }: TextAreaFieldProps) {
  return (
    <FieldFrame label={label} error={error} hint={hint} className={className}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={controlClass(Boolean(error))}
          {...textarea}
        />
      )}
    </FieldFrame>
  );
}
