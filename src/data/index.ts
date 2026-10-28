import { db } from './db';
import { createDexieStore } from './dexieStore';

/** The app's single data entry point. Swap the implementation here to change backends. */
export const store = createDexieStore(db);

export { StoreError, type StoreErrorCode, type DataSnapshot, type DataStore } from './store';
