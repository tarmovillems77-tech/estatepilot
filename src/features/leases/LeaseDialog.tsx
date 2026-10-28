import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { store } from '@/data';
import { useLeases, useProperties, useTenants, useUnits } from '@/data/hooks';
import { todayIso } from '@/domain/dates';
import { effectiveIndexation, isLeaseActive, leasesOverlap } from '@/domain/leases';
import type { Lease } from '@/domain/types';
import { et } from '@/i18n/et';
import { toNumberInput } from '@/i18n/parse';
import { errorMessage, type FieldErrors } from '@/i18n/validation';
import { indexationLabel } from './labels';
import {
  emptyLeaseForm,
  emptyTenantForm,
  NEW_TENANT,
  toLeaseForm,
  validateLeaseForm,
  validateTenantForm,
  type LeaseField,
  type LeaseFormValues,
  type TenantField,
} from './leaseForm';
import { TenantFields } from './TenantFields';

const text = et.leases;

interface LeaseDialogProps {
  open: boolean;
  onClose: () => void;
  /** Lease to edit; omitted when adding. */
  lease?: Lease;
  /** Preselected unit for a new lease. */
  unitId?: string;
}

export function LeaseDialog({ open, onClose, lease, unitId }: LeaseDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={lease ? text.editTitle : text.newTitle}>
      <LeaseForm
        key={lease?.id ?? `new-${unitId ?? ''}`}
        initial={lease ? toLeaseForm(lease) : emptyLeaseForm(todayIso(), unitId)}
        leaseId={lease?.id}
        onDone={onClose}
      />
    </Dialog>
  );
}

function LeaseForm({
  initial,
  leaseId,
  onDone,
}: {
  initial: LeaseFormValues;
  leaseId?: string;
  onDone: () => void;
}) {
  const properties = useProperties();
  const units = useUnits();
  const tenants = useTenants();
  const leases = useLeases();

  const [values, setValues] = useState(initial);
  const [tenant, setTenant] = useState(emptyTenantForm);
  const [errors, setErrors] = useState<FieldErrors<LeaseField>>({});
  const [tenantErrors, setTenantErrors] = useState<FieldErrors<TenantField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!properties || !units || !tenants || !leases) {
    return <p className="text-sm text-slate-500">{et.common.loading}</p>;
  }

  const existingLeases = leases;
  const today = todayIso();
  const occupied = new Set(leases.filter((l) => isLeaseActive(l, today)).map((l) => l.unitId));
  const selectedUnit = units.find((u) => u.id === values.unitId);
  const selectedProperty = properties.find((p) => p.id === selectedUnit?.propertyId);
  const creatingTenant = values.tenantId === NEW_TENANT;

  const set = (field: LeaseField, value: string) =>
    setValues((current) => {
      const next = { ...current, [field]: value };
      // Suggest the unit's market rent when choosing a unit for an empty form.
      if (field === 'unitId' && current.monthlyRent === '') {
        const unit = units.find((u) => u.id === value);
        if (unit) next.monthlyRent = toNumberInput(unit.marketRent);
      }
      return next;
    });

  const bind = (field: LeaseField) => ({
    name: field,
    label: text.fields[field],
    value: values[field],
    error: errors[field],
    onChange: (e: { target: { value: string } }) => set(field, e.target.value),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const leaseResult = validateLeaseForm(values);
    const tenantResult = creatingTenant ? validateTenantForm(tenant) : null;
    setErrors(leaseResult.ok ? {} : leaseResult.errors);
    setTenantErrors(tenantResult && !tenantResult.ok ? tenantResult.errors : {});
    if (!leaseResult.ok || (tenantResult && !tenantResult.ok)) {
      setFormError(et.validation.fixErrors);
      return;
    }

    // Checked here as well as in the store, so no tenant is created for a lease that fails.
    const draft = leaseResult.value;
    if (
      existingLeases.some(
        (l) => l.unitId === draft.unitId && l.id !== leaseId && leasesOverlap(l, draft),
      )
    ) {
      setFormError(et.errors.leaseOverlap);
      return;
    }

    setSaving(true);
    try {
      const tenantId =
        tenantResult?.ok === true
          ? (await store.tenants.create(tenantResult.value)).id
          : draft.tenantId;
      const input = { ...draft, tenantId };
      if (leaseId) await store.leases.update(leaseId, input);
      else await store.leases.create(input);
      onDone();
    } catch (error) {
      setFormError(errorMessage(error));
      setSaving(false);
    }
  }

  const unitGroups = [...properties]
    .sort((a, b) => a.name.localeCompare(b.name, 'et'))
    .map((property) => ({
      label: property.name,
      options: units
        .filter((u) => u.propertyId === property.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'et', { numeric: true }))
        .map((u) => ({
          value: u.id,
          label: `${u.name}${occupied.has(u.id) ? '' : text.vacantSuffix}`,
        })),
    }))
    .filter((group) => group.options.length > 0);

  const tenantOptions = [
    ...[...tenants]
      .sort((a, b) => a.name.localeCompare(b.name, 'et'))
      .map((t) => ({ value: t.id, label: t.name })),
    { value: NEW_TENANT, label: text.newTenantOption },
  ];

  const fallback = selectedProperty
    ? indexationLabel(effectiveIndexation(undefined, selectedProperty))
    : text.indexation.scenario;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          {...bind('unitId')}
          placeholder={text.chooseUnit}
          groups={unitGroups}
          className="sm:col-span-2"
        />
        <SelectField
          {...bind('tenantId')}
          placeholder={text.chooseTenant}
          options={tenantOptions}
          className="sm:col-span-2"
        />
      </div>

      {creatingTenant && (
        <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">{text.newTenantTitle}</legend>
          <TenantFields
            compact
            values={tenant}
            errors={tenantErrors}
            onChange={(field, value) => setTenant((current) => ({ ...current, [field]: value }))}
          />
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField {...bind('startDate')} type="date" />
        <TextField {...bind('endDate')} type="date" hint={text.hints.endDate} />
        <NumberField {...bind('monthlyRent')} suffix="€" />
        <NumberField {...bind('deposit')} suffix="€" hint={text.hints.deposit} />
        <NumberField {...bind('paymentDay')} inputMode="numeric" hint={text.hints.paymentDay} />
        <NumberField
          {...bind('annualIndexation')}
          suffix="%"
          hint={text.hints.annualIndexation(fallback)}
        />
        <TextAreaField {...bind('notes')} className="sm:col-span-2" rows={2} />
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
