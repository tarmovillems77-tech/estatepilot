import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { store } from '@/data';
import type { Tenant } from '@/domain/types';
import { et } from '@/i18n/et';
import { errorMessage, type FieldErrors } from '@/i18n/validation';
import {
  emptyTenantForm,
  toTenantForm,
  validateTenantForm,
  type TenantField,
  type TenantFormValues,
} from './leaseForm';
import { TenantFields } from './TenantFields';

export function TenantDialog({
  open,
  onClose,
  tenant,
}: {
  open: boolean;
  onClose: () => void;
  /** Tenant to edit; omitted when adding. */
  tenant?: Tenant;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tenant ? et.tenants.editTitle : et.tenants.newTitle}
    >
      <TenantForm
        key={tenant?.id ?? 'new'}
        initial={tenant ? toTenantForm(tenant) : emptyTenantForm()}
        tenantId={tenant?.id}
        onDone={onClose}
      />
    </Dialog>
  );
}

function TenantForm({
  initial,
  tenantId,
  onDone,
}: {
  initial: TenantFormValues;
  tenantId?: string;
  onDone: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<TenantField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateTenantForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      if (tenantId) await store.tenants.update(tenantId, result.value);
      else await store.tenants.create(result.value);
      onDone();
    } catch (error) {
      setFormError(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TenantFields
        values={values}
        errors={errors}
        onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      />
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
