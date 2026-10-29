import type {
  LeaseInput,
  LoanInput,
  PropertyInput,
  ScenarioSetInput,
  TenantInput,
  TransactionInput,
  UnitInput,
} from './schemas';

export interface EntityMeta {
  id: string;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
}

export type WithMeta<T> = T & EntityMeta;

export type Property = WithMeta<PropertyInput>;
export type Unit = WithMeta<UnitInput>;
export type Tenant = WithMeta<TenantInput>;
export type Lease = WithMeta<LeaseInput>;
export type Transaction = WithMeta<TransactionInput>;
export type Loan = WithMeta<LoanInput>;
export type ScenarioSet = WithMeta<ScenarioSetInput>;

export type {
  LeaseInput,
  LoanInput,
  PropertyInput,
  PropertyStatus,
  PropertyType,
  RateType,
  DayCount,
  EuriborTenor,
  RefinanceSettings,
  RepaymentType,
  ScenarioAssumptions,
  ScenarioSetInput,
  TenantInput,
  TenantKind,
  TransactionInput,
  UnitInput,
  UnitType,
} from './schemas';
export type { ExpenseCategory, IncomeCategory, TransactionCategory } from './categories';
