import type { LocalDb } from './local-db';
import { type LocalGroupDetail, readLocalGroup } from './local-group-store';
import { deviceDbIfAny } from './local-session';

/*
 * Where the query layer picks the data source of a group (ADR-0021): a local
 * group reads and writes the local group store over the device database,
 * any other group the user's cache, the outbox and the API. Queries and
 * mutations branch here, once; screens don't.
 */

/** The local group with this id, or `undefined` for a synced group (and always on the web). */
export async function findLocalGroup(groupId: string): Promise<LocalGroupDetail | undefined> {
  const db = await deviceDbIfAny();
  return db ? readLocalGroup(db, groupId) : undefined;
}

/** Whether the group is a local group — its data never comes from or goes to the API. */
export async function isLocalGroup(groupId: string): Promise<boolean> {
  return (await findLocalGroup(groupId)) !== undefined;
}

/** The device database, for writing local groups (native only — the web has no local groups). */
export async function localGroupsDb(): Promise<LocalDb> {
  const db = await deviceDbIfAny();
  if (!db) throw new Error('Local groups are not available on the web');
  return db;
}
