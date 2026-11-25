import { onlineManager } from '@tanstack/react-query';
import type { LocalDb } from './local-db';
import { hasLocalGroup } from './local-group-store';
import { deviceDbIfAny } from './local-session';

/*
 * Where the query layer picks the data source of a group (ADR-0021): a local
 * group reads and writes the local group store over the device database,
 * any other group the user's cache, the outbox and the API. Queries and
 * mutations branch here, once (`onGroupSource`); screens don't.
 */

/** A group query's or mutation's two implementations, one per data source. */
export interface GroupSource<Local, Synced> {
  /** A local group: over the device database. */
  local: (db: LocalDb) => Promise<Local>;
  /** Any other group: the user's cache, the outbox and the API. */
  synced: () => Promise<Synced>;
}

/** Runs the group's implementation for where it lives: `local` for a local group, `synced` otherwise (always on the web). */
export async function onGroupSource<Local, Synced>(
  groupId: string,
  source: GroupSource<Local, Synced>,
): Promise<Local | Synced> {
  const db = await deviceDbIfAny();
  return db && (await hasLocalGroup(db, groupId)) ? source.local(db) : syncedWrite(source.synced);
}

/** Errors thrown by a synced group's implementation — the only failures a group write retries. */
const syncedFailures = new WeakSet<object>();

/**
 * Runs a synced group's write (the API), marking its failure as one that
 * `groupWriteNetwork` may retry once back online. `onGroupSource` does it for
 * the synced implementation; a create that branches on its input calls it itself.
 */
export async function syncedWrite<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (typeof error === 'object' && error !== null) syncedFailures.add(error);
    throw error;
  }
}

/**
 * The network options of a mutation that writes a local group or, for a
 * synced group, calls the API directly (no outbox). It runs at once, offline
 * too (`offlineFirst`), so a local write needs no network and its error shows
 * at once; a synced write (`syncedWrite`) that failed offline pauses until the
 * device is online and is tried once more — as it paused under the default
 * `online` mode (mutations don't retry by default, so `offlineFirst` alone
 * would fail it at once).
 */
export const groupWriteNetwork = {
  networkMode: 'offlineFirst',
  retry: (failureCount: number, error: unknown): boolean =>
    failureCount < 1 &&
    !onlineManager.isOnline() &&
    typeof error === 'object' &&
    error !== null &&
    syncedFailures.has(error),
} as const;

/** The device database, for creating local groups (native only — the web has no local groups). */
export async function localGroupsDb(): Promise<LocalDb> {
  const db = await deviceDbIfAny();
  if (!db) throw new Error('Local groups are not available on the web');
  return db;
}
