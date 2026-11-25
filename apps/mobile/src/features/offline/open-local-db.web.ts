import type { LocalDb } from './local-db';

/**
 * Web has no local database — neither the offline cache nor the device
 * database (local groups, ADR-0021): the app is native-only (web is the
 * read-only group view, #19), and expo-sqlite on web needs WASM + COOP/COEP
 * headers. Not reached while web has no sign-in or local groups.
 */
export async function openLocalDb(_name: string): Promise<LocalDb> {
  throw new Error('Local databases are not available on web');
}

/** Nothing to delete on web (no local databases). */
export async function deleteLocalDbFile(_name: string): Promise<void> {}
