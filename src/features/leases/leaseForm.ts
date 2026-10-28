import { leaseSchema, tenantSchema } from '@/domain/schemas';
import type { LeaseInput, TenantInput } from '@/domain/types';
import { parseNumberInput, parsePercentInput, toNumberInput, toPercentInput } from '@/i18n/parse';
import { validateForm } from '@/i18n/validation';

/* Text-based form values for leases and tenants; see properties/propertyForm.ts. */

const optionalText = (text: string) => (text.trim() === '' ? undefined : text.trim());

/** Select value meaning "create a new tenant together with the lease". */
export const NEW_TENANT = '__new__';

export interface LeaseFormValues {
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  deposit: string;
  paymentDay: string;
  annualIndexation: string;
  notes: string;
}

export type LeaseField = keyof LeaseFormValues;

export function emptyLeaseForm(today: string, unitId = ''): LeaseFormValues {
  return {
    unitId,
    tenantId: '',
    startDate: today,
    endDate: '',
    monthlyRent: '',
    deposit: '',
    paymentDay: '1',
    annualIndexation: '',
    notes: '',
  };
}

export function toLeaseForm(lease: LeaseInput): LeaseFormValues {
  return {
    unitId: lease.unitId,
    tenantId: lease.tenantId,
    startDate: lease.startDate,
    endDate: lease.endDate ?? '',
    monthlyRent: toNumberInput(lease.monthlyRent),
    deposit: toNumberInput(lease.deposit),
    paymentDay: String(lease.paymentDay),
    annualIndexation: toPercentInput(lease.annualIndexation),
    notes: lease.notes ?? '',
  };
}

/**
 * Validates lease fields. When a new tenant is being created, `tenantId` is still unknown;
 * a placeholder passes validation and the real id is filled in after the tenant is saved.
 */
export function validateLeaseForm(values: LeaseFormValues) {
  return validateForm<LeaseInput, LeaseField>(
    leaseSchema,
    {
      unitId: values.unitId,
      tenantId: values.tenantId,
      startDate: values.startDate,
      endDate: values.endDate === '' ? null : values.endDate,
      monthlyRent: parseNumberInput(values.monthlyRent),
      deposit: parseNumberInput(values.deposit) ?? 0,
      paymentDay: parseNumberInput(values.paymentDay),
      annualIndexation: parsePercentInput(values.annualIndexation) ?? null,
      notes: optionalText(values.notes),
    },
    ['annualIndexation'],
  );
}

export interface TenantFormValues {
  kind: TenantInput['kind'];
  name: string;
  registryCode: string;
  email: string;
  phone: string;
  notes: string;
}

export type TenantField = keyof TenantFormValues;

export function emptyTenantForm(): TenantFormValues {
  return { kind: 'person', name: '', registryCode: '', email: '', phone: '', notes: '' };
}

export function toTenantForm(tenant: TenantInput): TenantFormValues {
  return {
    kind: tenant.kind,
    name: tenant.name,
    registryCode: tenant.registryCode ?? '',
    email: tenant.email ?? '',
    phone: tenant.phone ?? '',
    notes: tenant.notes ?? '',
  };
}

export function validateTenantForm(values: TenantFormValues) {
  return validateForm<TenantInput, TenantField>(tenantSchema, {
    kind: values.kind,
    name: values.name,
    // Registry codes only apply to companies.
    registryCode: values.kind === 'company' ? optionalText(values.registryCode) : undefined,
    email: optionalText(values.email),
    phone: optionalText(values.phone),
    notes: optionalText(values.notes),
  });
}
