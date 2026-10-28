import type {
  LeaseInput,
  LoanInput,
  PropertyInput,
  TenantInput,
  TransactionInput,
  UnitInput,
  WithMeta,
} from '@/domain/types';

/*
 * Storage-agnostic contract between the UI and persistence. The app uses the Dexie
 * (IndexedDB) implementation today; a cloud backend only needs to implement DataStore.
 */

export interface Repository<TInput> {
  list(): Promise<WithMeta<TInput>[]>;
  get(id: string): Promise<WithMeta<TInput> | undefined>;
  /** Validates the input and assigns id and timestamps. */
  create(input: TInput): Promise<WithMeta<TInput>>;
  update(id: string, changes: Partial<TInput>): Promise<WithMeta<TInput>>;
  /** Also removes or detaches dependent records (see the implementation for the rules). */
  remove(id: string): Promise<void>;
}

/** Inclusive ISO date range. */
export interface DateRange {
  from: string;
  to: string;
}

export interface DataStore {
  properties: Repository<PropertyInput>;
  units: Repository<UnitInput> & {
    listByProperty(propertyId: string): Promise<WithMeta<UnitInput>[]>;
  };
  tenants: Repository<TenantInput>;
  leases: Repository<LeaseInput> & {
    listByUnit(unitId: string): Promise<WithMeta<LeaseInput>[]>;
  };
  transactions: Repository<TransactionInput> & {
    listInRange(range: DateRange, propertyId?: string): Promise<WithMeta<TransactionInput>[]>;
  };
  loans: Repository<LoanInput> & {
    listByProperty(propertyId: string): Promise<WithMeta<LoanInput>[]>;
  };
  counts(): Promise<Record<keyof DataSnapshot, number>>;
  /** Replaces all data at once, e.g. restoring demo data or a backup. */
  replaceAll(snapshot: DataSnapshot): Promise<void>;
  clearAll(): Promise<void>;
}

export interface DataSnapshot {
  properties: WithMeta<PropertyInput>[];
  units: WithMeta<UnitInput>[];
  tenants: WithMeta<TenantInput>[];
  leases: WithMeta<LeaseInput>[];
  transactions: WithMeta<TransactionInput>[];
  loans: WithMeta<LoanInput>[];
}

export type StoreErrorCode = 'notFound' | 'tenantHasLeases';

/** Expected failures the UI can explain to the user (messages live in et.ts). */
export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode) {
    super(code);
    this.name = 'StoreError';
    this.code = code;
  }
}
