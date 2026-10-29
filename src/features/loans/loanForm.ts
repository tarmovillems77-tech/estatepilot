import { standardTermYears } from '@/domain/finance/loan';
import { loanSchema } from '@/domain/schemas';
import type { EuriborTenor, LoanInput } from '@/domain/types';
import { et } from '@/i18n/et';
import { parseNumberInput, parsePercentInput, toNumberInput, toPercentInput } from '@/i18n/parse';
import { validateForm, type FieldErrors, type ValidationResult } from '@/i18n/validation';

/* Text-based form values for loans; see properties/propertyForm.ts. */

const optionalText = (text: string) => (text.trim() === '' ? undefined : text.trim());

/** Select value for "not tied to one property". */
export const PORTFOLIO = '__portfolio__';
/** Term select value for a term that is not one of the standard years. */
export const CUSTOM_TERM = 'custom';

export interface LoanFormValues {
  propertyId: string;
  lender: string;
  reference: string;
  principal: string;
  startDate: string;
  /** "228" (19 years) … or CUSTOM_TERM */
  termPreset: string;
  termMonths: string;
  repaymentType: LoanInput['repaymentType'];
  rateType: LoanInput['rateType'];
  euriborTenor: EuriborTenor;
  euribor: string;
  margin: string;
  fixedRate: string;
  dayCount: LoanInput['dayCount'];
  actualAmount: string;
  actualDate: string;
  notes: string;
}

export type LoanField = keyof LoanFormValues;

export const termPresetOptions = standardTermYears.map((years) => String(years * 12));

export function emptyLoanForm(today: string, propertyId = ''): LoanFormValues {
  return {
    propertyId,
    lender: '',
    reference: '',
    principal: '',
    startDate: today,
    termPreset: '240',
    termMonths: '240',
    repaymentType: 'annuity',
    rateType: 'euribor',
    euriborTenor: '6M',
    euribor: '',
    margin: '',
    fixedRate: '',
    dayCount: 'act/360',
    actualAmount: '',
    actualDate: '',
    notes: '',
  };
}

export function toLoanForm(loan: LoanInput): LoanFormValues {
  const months = String(loan.termMonths);
  return {
    propertyId: loan.propertyId ?? PORTFOLIO,
    lender: loan.lender,
    reference: loan.reference ?? '',
    principal: toNumberInput(loan.principal),
    startDate: loan.startDate,
    termPreset: termPresetOptions.includes(months) ? months : CUSTOM_TERM,
    termMonths: months,
    repaymentType: loan.repaymentType,
    rateType: loan.rateType,
    euriborTenor: loan.rateType === 'euribor' ? loan.euriborTenor : '6M',
    euribor: loan.rateType === 'euribor' ? toPercentInput(loan.euribor) : '',
    margin: loan.rateType === 'euribor' ? toPercentInput(loan.margin) : '',
    fixedRate: loan.rateType === 'fixed' ? toPercentInput(loan.fixedRate) : '',
    dayCount: loan.dayCount,
    actualAmount: toNumberInput(loan.actualBalance?.amount),
    actualDate: loan.actualBalance?.date ?? '',
    notes: loan.notes ?? '',
  };
}

export function validateLoanForm(values: LoanFormValues): ValidationResult<LoanInput, LoanField> {
  const hasActual = values.actualAmount.trim() !== '' || values.actualDate !== '';
  const base = {
    propertyId: values.propertyId === PORTFOLIO ? null : values.propertyId,
    lender: values.lender,
    reference: optionalText(values.reference),
    principal: parseNumberInput(values.principal),
    startDate: values.startDate,
    termMonths: parseNumberInput(
      values.termPreset === CUSTOM_TERM ? values.termMonths : values.termPreset,
    ),
    repaymentType: values.repaymentType,
    dayCount: values.dayCount,
    actualBalance: hasActual
      ? { amount: parseNumberInput(values.actualAmount), date: values.actualDate }
      : null,
    notes: optionalText(values.notes),
  };
  const candidate =
    values.rateType === 'fixed'
      ? { ...base, rateType: 'fixed', fixedRate: parsePercentInput(values.fixedRate) }
      : {
          ...base,
          rateType: 'euribor',
          euriborTenor: values.euriborTenor,
          euribor: parsePercentInput(values.euribor),
          margin: parsePercentInput(values.margin),
        };

  const result = validateForm<LoanInput, LoanField | 'actualBalance'>(loanSchema, candidate, [
    'fixedRate',
    'margin',
  ]);
  if (result.ok) return result;

  // Map schema paths onto form fields.
  const { actualBalance, ...errors } = result.errors;
  const mapped: FieldErrors<LoanField> = errors;
  if (actualBalance) {
    const message = et.loans.hints.actualBoth;
    if (parseNumberInput(values.actualAmount) === undefined) mapped.actualAmount = message;
    if (values.actualDate === '') mapped.actualDate = message;
    if (!mapped.actualAmount && !mapped.actualDate) mapped.actualAmount = actualBalance;
  }
  if (mapped.termMonths && values.termPreset !== CUSTOM_TERM) {
    mapped.termPreset = mapped.termMonths;
  }
  return { ok: false, errors: mapped };
}
