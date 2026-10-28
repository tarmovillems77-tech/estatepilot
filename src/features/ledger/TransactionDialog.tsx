import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { NumberField, SelectField, TextField } from '@/components/ui/fields';
import { store } from '@/data';
import { useLeases, useProperties, useTenants, useUnits } from '@/data/hooks';
import {
  expenseCategories,
  expenseGroupOf,
  expenseGroups,
  incomeCategories,
} from '@/domain/categories';
import { todayIso } from '@/domain/dates';
import { isLeaseActive } from '@/domain/leases';
import type { Transaction } from '@/domain/types';
import { termLabel } from '@/features/leases/labels';
import { et } from '@/i18n/et';
import { errorMessage, type FieldErrors } from '@/i18n/validation';
import {
  defaultCategory,
  emptyTransactionForm,
  toTransactionForm,
  validateTransactionForm,
  type TransactionField,
  type TransactionFormValues,
} from './transactionForm';

const text = et.ledger.transactions;

export function TransactionDialog({
  open,
  onClose,
  transaction,
  propertyId,
}: {
  open: boolean;
  onClose: () => void;
  /** Transaction to edit; omitted when adding. */
  transaction?: Transaction;
  /** Preselected property for a new transaction. */
  propertyId?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={transaction ? text.editTitle : text.newTitle}>
      <TransactionForm
        key={transaction?.id ?? 'new'}
        initial={
          transaction
            ? toTransactionForm(transaction)
            : emptyTransactionForm(todayIso(), propertyId)
        }
        transaction={transaction}
        onDone={onClose}
      />
    </Dialog>
  );
}

function TransactionForm({
  initial,
  transaction,
  onDone,
}: {
  initial: TransactionFormValues;
  transaction?: Transaction;
  onDone: () => void;
}) {
  const properties = useProperties();
  const units = useUnits();
  const leases = useLeases();
  const tenants = useTenants();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<TransactionField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!properties || !units || !leases || !tenants) {
    return <p className="text-sm text-slate-500">{et.common.loading}</p>;
  }

  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const propertyUnits = units
    .filter((u) => u.propertyId === values.propertyId)
    .sort((a, b) => a.name.localeCompare(b.name, 'et', { numeric: true }));
  const unitIds = new Set(propertyUnits.map((u) => u.id));
  const leaseOptions = leases.filter((l) =>
    values.unitId ? l.unitId === values.unitId : unitIds.has(l.unitId),
  );

  const set = (field: TransactionField, value: string) =>
    setValues((current) => {
      const next = { ...current, [field]: value } as TransactionFormValues;
      if (field === 'kind') next.category = defaultCategory[next.kind];
      if (field === 'propertyId') {
        next.unitId = '';
        next.leaseId = '';
      }
      // Choosing a unit for income links the lease active on the payment date.
      if (field === 'unitId' && next.kind === 'income') {
        const active = leases.find((l) => l.unitId === value && isLeaseActive(l, next.date));
        next.leaseId = active?.id ?? '';
        const unit = units.find((u) => u.id === value);
        if (unit?.type === 'parking') next.category = 'parking';
      }
      return next;
    });

  const bind = (field: TransactionField) => ({
    name: field,
    label: text.fields[field],
    value: values[field],
    error: errors[field],
    onChange: (e: { target: { value: string } }) => set(field, e.target.value),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateTransactionForm(values, transaction?.source);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(et.validation.fixErrors);
      return;
    }
    setSaving(true);
    try {
      if (transaction) await store.transactions.update(transaction.id, result.value);
      else await store.transactions.create(result.value);
      onDone();
    } catch (error) {
      setFormError(errorMessage(error));
      setSaving(false);
    }
  }

  const categoryHint =
    values.kind === 'expense' && values.category === 'loan_payment'
      ? text.hints.loanPayment
      : values.kind === 'expense' && values.category === 'capex'
        ? text.hints.capex
        : undefined;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          {...bind('kind')}
          options={(['income', 'expense'] as const).map((k) => ({
            value: k,
            label: et.labels.transactionKind[k],
          }))}
        />
        <TextField {...bind('date')} type="date" />
        {values.kind === 'income' ? (
          <SelectField
            {...bind('category')}
            options={incomeCategories.map((c) => ({
              value: c,
              label: et.labels.incomeCategory[c],
            }))}
            className="sm:col-span-2"
          />
        ) : (
          <SelectField
            {...bind('category')}
            hint={categoryHint}
            groups={expenseGroups.map((group) => ({
              label: et.labels.expenseGroup[group],
              options: expenseCategories
                .filter((c) => expenseGroupOf[c] === group)
                .map((c) => ({ value: c, label: et.labels.expenseCategory[c] })),
            }))}
            className="sm:col-span-2"
          />
        )}
        <SelectField
          {...bind('propertyId')}
          placeholder={text.chooseProperty}
          options={[...properties]
            .sort((a, b) => a.name.localeCompare(b.name, 'et'))
            .map((p) => ({ value: p.id, label: p.name }))}
        />
        <SelectField
          {...bind('unitId')}
          options={[
            { value: '', label: text.wholeProperty },
            ...propertyUnits.map((u) => ({ value: u.id, label: u.name })),
          ]}
          disabled={values.propertyId === ''}
        />
        {values.kind === 'income' && (
          <>
            <SelectField
              {...bind('leaseId')}
              hint={text.hints.leaseId}
              options={[
                { value: '', label: text.noLease },
                ...leaseOptions.map((l) => ({
                  value: l.id,
                  label: `${tenantName.get(l.tenantId) ?? '—'} (${termLabel(l)})`,
                })),
              ]}
              disabled={values.propertyId === ''}
            />
            <TextField
              {...bind('periodMonth')}
              type="month"
              hint={text.hints.periodMonth}
              disabled={values.leaseId === ''}
            />
          </>
        )}
        <NumberField {...bind('amount')} suffix="€" />
        <TextField {...bind('counterparty')} />
        <TextField {...bind('description')} className="sm:col-span-2" />
        <TextField
          {...bind('externalRef')}
          hint={text.hints.externalRef}
          className="sm:col-span-2"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {et.properties.form.save}
        </Button>
        <Button variant="secondary" onClick={onDone}>
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
