import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { store } from '@/data';
import { unitTypes } from '@/domain/schemas';
import type { PropertyType, Unit } from '@/domain/types';
import { et } from '@/i18n/et';
import { errorMessage, type FieldErrors } from '@/i18n/validation';
import {
  emptyUnitForm,
  toUnitForm,
  validateUnitForm,
  type UnitField,
  type UnitFormValues,
} from './propertyForm';

const text = et.units;

interface UnitDialogProps {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  propertyType: PropertyType;
  /** Unit to edit; omitted when adding. */
  unit?: Unit;
}

export function UnitDialog({ open, onClose, propertyId, propertyType, unit }: UnitDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={unit ? text.editTitle : text.newTitle}>
      <UnitForm
        key={unit?.id ?? 'new'}
        initial={unit ? toUnitForm(unit) : emptyUnitForm(propertyType)}
        propertyId={propertyId}
        unitId={unit?.id}
        onDone={onClose}
      />
    </Dialog>
  );
}

function UnitForm({
  initial,
  propertyId,
  unitId,
  onDone,
}: {
  initial: UnitFormValues;
  propertyId: string;
  unitId?: string;
  onDone: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<UnitField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bind = (field: UnitField) => ({
    name: field,
    label: text.fields[field],
    value: values[field],
    error: errors[field],
    onChange: (e: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [field]: e.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateUnitForm(values, propertyId);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      if (unitId) await store.units.update(unitId, result.value);
      else await store.units.create(result.value);
      onDone();
    } catch (error) {
      setFormError(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField {...bind('name')} hint={text.hints.name} autoFocus />
        <SelectField
          {...bind('type')}
          options={unitTypes.map((t) => ({ value: t, label: et.labels.unitType[t] }))}
        />
        <NumberField {...bind('area')} suffix="m²" />
        <NumberField {...bind('marketRent')} suffix="€" />
        <NumberField {...bind('rooms')} inputMode="numeric" />
        <NumberField {...bind('floor')} inputMode="numeric" />
        <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">{text.hints.marketRent}</p>
        <TextAreaField {...bind('notes')} className="sm:col-span-2" rows={2} />
      </div>
      <div className="flex items-center gap-3">
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
