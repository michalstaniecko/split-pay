import type { LocalDb } from './local-db';

/**
 * Web has no offline cache: the signed-in app is native-only (web is the
 * read-only group view, #19), and expo-sqlite on web needs WASM + COOP/COEP
 * headers. Not reached while web has no sign-in.
 */
export async function openLocalDb(_name: string): Promise<LocalDb> {
  throw new Error('The offline cache is not available on web');
}
