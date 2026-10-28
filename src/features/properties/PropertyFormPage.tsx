import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { store } from '@/data';
import { useProperty } from '@/data/hooks';
import { todayIso } from '@/domain/dates';
import { propertyStatuses, propertyTypes } from '@/domain/schemas';
import { et } from '@/i18n/et';
import { errorMessage, type FieldErrors } from '@/i18n/validation';
import {
  emptyPropertyForm,
  toPropertyForm,
  validatePropertyForm,
  type PropertyField,
  type PropertyFormValues,
} from './propertyForm';

const text = et.properties.form;

/** Create (/kinnisvara/uus) and edit (/kinnisvara/:id/muuda) a property. */
export function PropertyFormPage() {
  const { id } = useParams();
  const property = useProperty(id);

  if (!id) return <PropertyForm initial={emptyPropertyForm(todayIso())} />;
  if (property === undefined) return <p className="text-sm text-slate-500">{et.common.loading}</p>;
  if (property === null)
    return <p className="text-sm text-slate-600">{et.properties.detail.notFound}</p>;
  return <PropertyForm key={property.id} id={property.id} initial={toPropertyForm(property)} />;
}

function PropertyForm({ id, initial }: { id?: string; initial: PropertyFormValues }) {
  const navigate = useNavigate();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<PropertyField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cancelTo = id ? `/kinnisvara/${id}` : '/kinnisvara';

  /** Props shared by every field bound to `values[field]`. */
  const bind = (field: PropertyField) => ({
    name: field,
    label: text.fields[field],
    value: values[field],
    error: errors[field],
    onChange: (e: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [field]: e.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validatePropertyForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(et.validation.fixErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const saved = id
        ? await store.properties.update(id, result.value)
        : await store.properties.create(result.value);
      navigate(`/kinnisvara/${saved.id}`);
    } catch (error) {
      setFormError(errorMessage(error));
      setSaving(false);
    }
  }

  const sectionTitle = 'text-base font-semibold text-slate-900';

  return (
    <>
      <PageHeader title={id ? text.editTitle : text.newTitle} />
      <form onSubmit={submit} noValidate className="space-y-6">
        <Card className="space-y-4">
          <h2 className={sectionTitle}>{text.basics}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField {...bind('name')} className="sm:col-span-2" autoFocus />
            <SelectField
              {...bind('type')}
              options={propertyTypes.map((t) => ({ value: t, label: et.labels.propertyType[t] }))}
            />
            <SelectField
              {...bind('status')}
              options={propertyStatuses.map((s) => ({
                value: s,
                label: et.labels.propertyStatus[s],
              }))}
            />
            <TextField {...bind('address')} autoComplete="street-address" />
            <TextField {...bind('city')} />
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className={sectionTitle}>{text.purchase}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField {...bind('purchasePrice')} suffix="€" hint={text.hints.purchasePrice} />
            <NumberField
              {...bind('acquisitionCosts')}
              suffix="€"
              hint={text.hints.acquisitionCosts}
            />
            <TextField {...bind('purchaseDate')} type="date" hint={text.hints.purchaseDate} />
            <div className="hidden sm:block" />
            <NumberField {...bind('marketValue')} suffix="€" hint={text.hints.marketValue} />
            <TextField {...bind('marketValueDate')} type="date" />
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className={sectionTitle}>{text.details}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField {...bind('totalArea')} suffix="m²" />
            <NumberField {...bind('yearBuilt')} inputMode="numeric" />
            <NumberField {...bind('rentIndexation')} suffix="%" hint={text.hints.rentIndexation} />
            <TextAreaField {...bind('notes')} className="sm:col-span-3" />
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {text.save}
          </Button>
          <Link
            to={cancelTo}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {text.cancel}
          </Link>
          {formError && (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}
        </div>
      </form>
    </>
  );
}
