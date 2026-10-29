import { useLiveQuery } from 'dexie-react-hooks';
import { store } from './index';
import type { DateRange } from './store';

/*
 * Reactive reads for components. Each hook returns `undefined` while loading and
 * re-renders automatically when the underlying data changes.
 * This file is Dexie-specific: a cloud backend would replace it (e.g. with TanStack Query).
 */

export const useProperties = () => useLiveQuery(() => store.properties.list(), []);

/** `null` when the property does not exist (`undefined` still means loading). */
export const useProperty = (id: string | undefined) =>
  useLiveQuery(async () => (id ? ((await store.properties.get(id)) ?? null) : null), [id]);

export const usePropertyUnits = (propertyId: string | undefined) =>
  useLiveQuery(
    () => (propertyId ? store.units.listByProperty(propertyId) : Promise.resolve([])),
    [propertyId],
  );

export const usePropertyLoans = (propertyId: string | undefined) =>
  useLiveQuery(
    () => (propertyId ? store.loans.listByProperty(propertyId) : Promise.resolve([])),
    [propertyId],
  );

export const useUnits = () => useLiveQuery(() => store.units.list(), []);

export const useTenants = () => useLiveQuery(() => store.tenants.list(), []);

export const useLeases = () => useLiveQuery(() => store.leases.list(), []);

/** All transactions; fine for a local single-user database. */
export const useTransactions = () => useLiveQuery(() => store.transactions.list(), []);

export const useTransactionsInRange = ({ from, to }: DateRange, propertyId?: string) =>
  useLiveQuery(
    () => store.transactions.listInRange({ from, to }, propertyId),
    [from, to, propertyId],
  );

export const useLoans = () => useLiveQuery(() => store.loans.list(), []);

/** `null` when the loan does not exist (`undefined` still means loading). */
export const useLoan = (id: string | undefined) =>
  useLiveQuery(async () => (id ? ((await store.loans.get(id)) ?? null) : null), [id]);

export const useDataCounts = () => useLiveQuery(() => store.counts(), []);
