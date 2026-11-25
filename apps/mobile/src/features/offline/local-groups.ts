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
  return db && (await hasLocalGroup(db, groupId)) ? source.local(db) : source.synced();
}

/**
 * The network options of a mutation that writes a local group or, for a
 * synced group, calls the API directly (no outbox). It runs at once, offline
 * too (`offlineFirst`), so a local write needs no network; a synced write that
 * failed offline pauses until the device is online and is tried once more —
 * as it paused under the default `online` mode (mutations don't retry by
 * default, so `offlineFirst` alone would fail it at once).
 */
export const groupWriteNetwork = {
  networkMode: 'offlineFirst',
  retry: (failureCount: number): boolean => failureCount < 1 && !onlineManager.isOnline(),
} as const;

/** The device database, for creating local groups (native only — the web has no local groups). */
export async function localGroupsDb(): Promise<LocalDb> {
  const db = await deviceDbIfAny();
  if (!db) throw new Error('Local groups are not available on the web');
  return db;
}
