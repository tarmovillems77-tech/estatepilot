import { useLiveQuery } from 'dexie-react-hooks';
import { store } from './index';
import type { DateRange } from './store';

/*
 * Reactive reads for components. Each hook returns `undefined` while loading and
 * re-renders automatically when the underlying data changes.
 * This file is Dexie-specific: a cloud backend would replace it (e.g. with TanStack Query).
 */

export const useProperties = () => useLiveQuery(() => store.properties.list(), []);

export const useUnits = () => useLiveQuery(() => store.units.list(), []);

export const useTenants = () => useLiveQuery(() => store.tenants.list(), []);

export const useLeases = () => useLiveQuery(() => store.leases.list(), []);

export const useTransactionsInRange = ({ from, to }: DateRange, propertyId?: string) =>
  useLiveQuery(
    () => store.transactions.listInRange({ from, to }, propertyId),
    [from, to, propertyId],
  );

export const useLoans = () => useLiveQuery(() => store.loans.list(), []);

export const useDataCounts = () => useLiveQuery(() => store.counts(), []);
