import { z } from 'zod';
import { expenseCategories, incomeCategories } from './categories';

/*
 * Conventions:
 * - Money is in euros (EUR), VAT-exclusive. Rent and payments are monthly unless named otherwise.
 * - Rates and percentages are decimal ratios: 0.045 means 4.5%.
 * - Dates are ISO calendar dates ("2026-10-28"); `null` end dates mean open-ended.
 *
 * Schemas describe the user-editable fields. Id and timestamps are added by the data layer,
 * so the same schemas validate forms, imports and stored records.
 */

const isoDate = z.iso.date();
const money = z.number().finite().nonnegative();
const ratio = z.number().finite().min(0).max(1);
const optionalText = z.string().trim().max(2000).optional();

export const propertyTypes = ['residential', 'commercial'] as const;
/** owned = in the portfolio; prospect = an investment being evaluated (used in comparisons). */
export const propertyStatuses = ['owned', 'prospect'] as const;

export const propertySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(propertyTypes),
  status: z.enum(propertyStatuses),
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(80),
  /** Asking price for prospects. */
  purchasePrice: money,
  /** Notary, state fees, broker and other one-off acquisition costs. */
  acquisitionCosts: money,
  purchaseDate: isoDate.nullable(),
  marketValue: money,
  marketValueDate: isoDate,
  /** Total net area in m². */
  totalArea: z.number().finite().positive().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  /**
   * Default yearly rent indexation for this property's leases, e.g. 0.03.
   * 0 means rents stay flat; null means the forecast scenario's market rent growth applies.
   */
  rentIndexation: ratio.nullable().default(null),
  notes: optionalText,
});

export const unitTypes = [
  'apartment',
  'house',
  'office',
  'retail',
  'warehouse',
  'parking',
  'other',
] as const;

export const unitSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  type: z.enum(unitTypes),
  /** m² */
  area: z.number().finite().positive(),
  rooms: z.number().int().positive().optional(),
  floor: z.number().int().optional(),
  /** Expected monthly rent when vacant; also used for prospects. */
  marketRent: money,
  notes: optionalText,
});

export const tenantKinds = ['person', 'company'] as const;

export const tenantSchema = z.object({
  kind: z.enum(tenantKinds),
  name: z.string().trim().min(1).max(160),
  /** Company registry code; personal ID codes are deliberately not stored. */
  registryCode: z.string().trim().max(20).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(40).optional(),
  notes: optionalText,
});

export const leaseSchema = z
  .object({
    unitId: z.string().min(1),
    tenantId: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate.nullable(),
    monthlyRent: money,
    deposit: money,
    /** Day of month the rent is due. */
    paymentDay: z.number().int().min(1).max(28),
    /**
     * Contractual yearly rent increase, e.g. 0.03. 0 means no indexation;
     * null means the property's default indexation applies.
     */
    annualIndexation: ratio.nullable(),
    notes: optionalText,
  })
  .refine((lease) => lease.endDate === null || lease.endDate >= lease.startDate, {
    path: ['endDate'],
    // Message key, translated in src/i18n/validation.ts.
    message: 'endBeforeStart',
  });

/** "YYYY-MM" */
export const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const transactionSources = ['manual', 'import', 'demo'] as const;

const transactionBase = {
  propertyId: z.string().min(1),
  unitId: z.string().min(1).nullable(),
  /** Rent payments: the lease (and through it the tenant) the payment belongs to. */
  leaseId: z.string().min(1).nullable().default(null),
  /** Payment or invoice date. */
  date: isoDate,
  /** Rent payments: the rent month being paid, if different from the payment date's month. */
  periodMonth: isoMonth.optional(),
  /** Always positive; the direction comes from `kind`. */
  amount: money,
  description: z.string().trim().max(300).optional(),
  /** Payer or payee as on the bank statement or invoice. */
  counterparty: z.string().trim().max(160).optional(),
  /** Bank archive id, reference number or invoice number; used to detect duplicate imports. */
  externalRef: z.string().trim().max(120).optional(),
  source: z.enum(transactionSources).default('manual'),
};

export const transactionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('income'), category: z.enum(incomeCategories), ...transactionBase }),
  z.object({ kind: z.literal('expense'), category: z.enum(expenseCategories), ...transactionBase }),
]);

export const repaymentTypes = ['annuity', 'equal_principal'] as const;
/** 3- or 6-month Euribor: also how often (in months) the variable rate resets. */
export const euriborTenors = ['3M', '6M'] as const;
/**
 * Interest day count. 30/360: every month is 1/12 of a year. act/360: actual days between
 * payments / 360 (common in Estonian bank loans; the annuity payment stays fixed and the
 * principal part absorbs the difference).
 */
export const dayCounts = ['30/360', 'act/360'] as const;

const loanBase = {
  /** null = portfolio-level loan, not secured by a single property. */
  propertyId: z.string().min(1).nullable(),
  lender: z.string().trim().min(1).max(120),
  /** Contract number or other identifier. */
  reference: z.string().trim().max(60).optional(),
  principal: z.number().finite().positive(),
  startDate: isoDate,
  termMonths: z.number().int().min(1).max(600),
  repaymentType: z.enum(repaymentTypes),
  dayCount: z.enum(dayCounts).default('30/360'),
  /**
   * Outstanding balance confirmed by the bank (statement, online bank) on `date`. The schedule
   * continues from this amount; everything else is calculated.
   */
  actualBalance: z
    .object({ amount: z.number().finite().nonnegative(), date: isoDate })
    .nullable()
    .default(null),
  notes: optionalText,
};

export const loanSchema = z.discriminatedUnion('rateType', [
  z.object({ rateType: z.literal('fixed'), fixedRate: ratio, ...loanBase }),
  z.object({
    rateType: z.literal('euribor'),
    /** Bank margin, fixed for the term. */
    margin: ratio,
    euriborTenor: z.enum(euriborTenors).default('6M'),
    /** Current Euribor of the chosen tenor (editable); forecast scenarios override it. */
    euribor: z.number().finite().min(-0.05).max(1),
    ...loanBase,
  }),
]);

export type PropertyInput = z.infer<typeof propertySchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type TenantInput = z.infer<typeof tenantSchema>;
export type LeaseInput = z.infer<typeof leaseSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
/** A yearly change such as rent growth or value change: −50% … +50%. */
const yearlyChange = z.number().finite().min(-0.5).max(0.5);
/** One Euribor value per forecast year. */
const euriborPathSchema = z.array(z.number().finite().min(-0.05).max(0.3)).length(5);

/** Assumptions of one forecast scenario (see domain/finance/forecast.ts for their use). */
export const scenarioAssumptionsSchema = z.object({
  rentGrowth: yearlyChange,
  vacancyRate: ratio,
  opexAdjustment: z.number().finite().min(-0.9).max(5),
  opexGrowth: yearlyChange,
  maintenanceReservePerM2: z.number().finite().min(0).max(1_000),
  valueGrowth: yearlyChange,
  capexReserveRate: ratio,
  euribor3m: euriborPathSchema,
  euribor6m: euriborPathSchema,
  marginChange: z.number().finite().min(-0.2).max(0.2),
});

export const refinanceSettingsSchema = z.object({
  enabled: z.boolean(),
  margin: ratio,
  euriborTenor: z.enum(euriborTenors),
  termYears: z.number().int().min(1).max(50),
  /** One-off costs per refinanced loan (contract fee, notary, mortgage change). */
  feesPerLoan: money,
});

/**
 * A saved set of the three scenarios plus property and loan overrides. Saved separately;
 * running it never changes properties, leases or loans.
 */
export const scenarioSetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalText,
  scenarios: z.object({
    optimistic: scenarioAssumptionsSchema,
    base: scenarioAssumptionsSchema,
    pessimistic: scenarioAssumptionsSchema,
  }),
  /** Per property: rent indexation used in place of the stored default, value change. */
  propertyOverrides: z
    .record(
      z.string(),
      z.object({ rentIndexation: ratio.nullable(), valueGrowth: yearlyChange.nullable() }),
    )
    .default({}),
  /** Per loan: margin and remaining repayment period from the forecast start. */
  loanOverrides: z
    .record(
      z.string(),
      z.object({
        margin: ratio.nullable(),
        remainingYears: z.number().int().min(1).max(50).nullable(),
      }),
    )
    .default({}),
  refinance: refinanceSettingsSchema,
});

export type LoanInput = z.infer<typeof loanSchema>;
export type ScenarioAssumptions = z.infer<typeof scenarioAssumptionsSchema>;
export type RefinanceSettings = z.infer<typeof refinanceSettingsSchema>;
export type ScenarioSetInput = z.infer<typeof scenarioSetSchema>;

export type PropertyType = PropertyInput['type'];
export type PropertyStatus = PropertyInput['status'];
export type UnitType = UnitInput['type'];
export type TenantKind = TenantInput['kind'];
export type RepaymentType = LoanInput['repaymentType'];
export type RateType = LoanInput['rateType'];
export type EuriborTenor = (typeof euriborTenors)[number];
export type DayCount = (typeof dayCounts)[number];
