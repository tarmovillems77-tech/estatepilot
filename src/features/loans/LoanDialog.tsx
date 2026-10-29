import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { store } from '@/data';
import { useProperties } from '@/data/hooks';
import { todayIso } from '@/domain/dates';
import { dayCounts, euriborTenors, repaymentTypes } from '@/domain/schemas';
import type { Loan } from '@/domain/types';
import { et } from '@/i18n/et';
import { errorMessage, type FieldErrors } from '@/i18n/validation';
import {
  CUSTOM_TERM,
  emptyLoanForm,
  PORTFOLIO,
  termPresetOptions,
  toLoanForm,
  validateLoanForm,
  type LoanField,
  type LoanFormValues,
} from './loanForm';

const text = et.loans;

export function LoanDialog({
  open,
  onClose,
  loan,
  propertyId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Loan to edit; omitted when adding. */
  loan?: Loan;
  /** Preselected property for a new loan. */
  propertyId?: string;
  onSaved?: (loan: Loan) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={loan ? text.editTitle : text.newTitle}>
      <LoanForm
        key={loan?.id ?? 'new'}
        initial={loan ? toLoanForm(loan) : emptyLoanForm(todayIso(), propertyId)}
        loanId={loan?.id}
        onDone={(saved) => {
          if (saved) onSaved?.(saved);
          onClose();
        }}
      />
    </Dialog>
  );
}

function LoanForm({
  initial,
  loanId,
  onDone,
}: {
  initial: LoanFormValues;
  loanId?: string;
  onDone: (saved?: Loan) => void;
}) {
  const properties = useProperties();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<LoanField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!properties) return <p className="text-sm text-slate-500">{et.common.loading}</p>;

  const bind = (field: LoanField) => ({
    name: field,
    label: text.fields[field],
    value: values[field],
    error: errors[field],
    onChange: (e: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [field]: e.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateLoanForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(et.validation.fixErrors);
      return;
    }
    setSaving(true);
    try {
      const saved = loanId
        ? await store.loans.update(loanId, result.value)
        : await store.loans.create(result.value);
      onDone(saved);
    } catch (error) {
      setFormError(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          {...bind('propertyId')}
          hint={text.hints.propertyId}
          placeholder={et.ledger.transactions.chooseProperty}
          options={[
            ...[...properties]
              .sort((a, b) => a.name.localeCompare(b.name, 'et'))
              .map((p) => ({ value: p.id, label: p.name })),
            { value: PORTFOLIO, label: text.portfolio },
          ]}
          className="sm:col-span-2"
        />
        <TextField {...bind('lender')} />
        <TextField {...bind('reference')} />
        <NumberField {...bind('principal')} suffix="€" />
        <TextField {...bind('startDate')} type="date" />
        <SelectField
          {...bind('termPreset')}
          options={[
            ...termPresetOptions.map((months) => ({
              value: months,
              label: text.years(Number(months) / 12),
            })),
            { value: CUSTOM_TERM, label: text.hints.termCustom },
          ]}
        />
        {values.termPreset === CUSTOM_TERM ? (
          <NumberField {...bind('termMonths')} inputMode="numeric" />
        ) : (
          <div className="hidden sm:block" />
        )}
        <SelectField
          {...bind('repaymentType')}
          options={repaymentTypes.map((r) => ({ value: r, label: et.labels.repaymentType[r] }))}
        />
        <SelectField
          {...bind('dayCount')}
          hint={text.hints.dayCount}
          options={dayCounts.map((d) => ({ value: d, label: et.labels.dayCount[d] }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          {...bind('rateType')}
          options={(['euribor', 'fixed'] as const).map((r) => ({
            value: r,
            label: et.labels.rateType[r],
          }))}
          className="sm:col-span-2"
        />
        {values.rateType === 'euribor' ? (
          <>
            <SelectField
              {...bind('euriborTenor')}
              options={euriborTenors.map((t) => ({ value: t, label: et.labels.euriborTenor[t] }))}
            />
            <NumberField {...bind('euribor')} suffix="%" hint={text.hints.euribor} />
            <NumberField {...bind('margin')} suffix="%" />
          </>
        ) : (
          <NumberField {...bind('fixedRate')} suffix="%" />
        )}
      </div>

      <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">{text.actualSection}</legend>
        <p className="mb-3 text-sm text-slate-600">{text.hints.actual}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField {...bind('actualAmount')} suffix="€" />
          <TextField {...bind('actualDate')} type="date" />
        </div>
      </fieldset>

      <TextAreaField {...bind('notes')} rows={2} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {et.properties.form.save}
        </Button>
        <Button variant="secondary" onClick={() => onDone()}>
          {et.properties.form.cancel}
        </Button>
        {formError && (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
