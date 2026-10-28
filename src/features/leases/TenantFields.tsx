import { SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { tenantKinds } from '@/domain/schemas';
import { et } from '@/i18n/et';
import type { FieldErrors } from '@/i18n/validation';
import type { TenantField, TenantFormValues } from './leaseForm';

const text = et.tenants;

/** Tenant inputs, shared by the tenant dialog and the "new tenant" part of the lease form. */
export function TenantFields({
  values,
  errors,
  onChange,
  compact = false,
}: {
  values: TenantFormValues;
  errors: FieldErrors<TenantField>;
  onChange: (field: TenantField, value: string) => void;
  /** Leaves out notes, for use inside another form. */
  compact?: boolean;
}) {
  const bind = (field: TenantField) => ({
    name: `tenant-${field}`,
    label: text.fields[field],
    value: values[field],
    error: errors[field],
    onChange: (e: { target: { value: string } }) => onChange(field, e.target.value),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        {...bind('kind')}
        options={tenantKinds.map((k) => ({ value: k, label: et.labels.tenantKind[k] }))}
      />
      <TextField {...bind('name')} hint={text.hints.name} />
      {values.kind === 'company' && (
        <TextField {...bind('registryCode')} hint={text.hints.registryCode} />
      )}
      <TextField {...bind('email')} type="email" autoComplete="off" />
      <TextField {...bind('phone')} type="tel" autoComplete="off" />
      {!compact && <TextAreaField {...bind('notes')} className="sm:col-span-2" rows={2} />}
    </div>
  );
}
