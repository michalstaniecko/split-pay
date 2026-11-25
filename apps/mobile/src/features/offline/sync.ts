import type { Entry } from '@split-pay/shared';
import { onlineManager } from '@tanstack/react-query';
import { DetailedError, parseResponse } from 'hono/client';
import { api } from '@/lib/api';
import { localDatabases } from './local-session';
import {
  applyGroupDelta,
  type CachedGroupListItem,
  type GroupDelta,
  groupsNeedingSync,
  readSyncCursor,
  removeGroup,
  saveGroupList,
} from './local-store';
import { classifySendError, flushOutbox, type OutboxOp, type SendOutcome } from './outbox';

/*
 * Sync with the server (ADR-0005): send the outbox, then pull. Screens never
 * read the API directly for groups and entries — their queries call these
 * functions and then read the local cache (`load*` in the query modules).
 */

/** Thrown by a sync attempted without a connection. */
export class OfflineError extends Error {
  constructor() {
    super('offline');
  }
}

export const isUnauthorized = (error: unknown) => error instanceof DetailedError && error.statusCode === 401;
export const isNotFound = (error: unknown) => error instanceof DetailedError && error.statusCode === 404;

type Listener = (groupIds: readonly string[]) => void;
const listeners = new Set<Listener>();

/** Called after sent outbox operations changed cached entries of these groups (to refresh their queries). */
export function onOutboxSent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sends one outbox operation through the matching entry route. */
async function sendOp(op: OutboxOp): Promise<SendOutcome> {
  const entries = api.groups[':groupId'].entries;
  const param = { groupId: op.groupId, entryId: op.entryId };
  try {
    let entry: Entry;
    switch (op.change) {
      case 'create':
        if (!op.payload) return { type: 'failed', error: 'invalid_entry' };
        entry = await parseResponse(entries.$post({ param: { groupId: op.groupId }, json: op.payload }));
        break;
      case 'edit':
        if (!op.payload || op.baseVersion === null) return { type: 'failed', error: 'invalid_entry' };
        entry = await parseResponse(
          entries[':entryId'].$put({ param, json: { baseVersion: op.baseVersion, entry: op.payload } }),
        );
        break;
      case 'delete':
        entry = await parseResponse(
          entries[':entryId'].$delete({ param, query: { baseVersion: String(op.baseVersion ?? 0) } }),
        );
        break;
      case 'restore':
        entry = await parseResponse(
          entries[':entryId'].restore.$post({ param, json: { baseVersion: op.baseVersion ?? 0 } }),
        );
        break;
    }
    return { type: 'sent', entry };
  } catch (error) {
    return classifySendError(error);
  }
}

let flushing: Promise<void> | null = null;
let flushAgain = false;

/**
 * Sends the outbox now (no-op offline). Concurrent calls share one run; a
 * call during a run makes it go once more, so an operation queued meanwhile
 * isn't left behind.
 */
export function flushNow(): Promise<void> {
  if (!onlineManager.isOnline()) return Promise.resolve();
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  flushing = (async () => {
    const db = await localDatabases.userDb();
    do {
      flushAgain = false;
      const result = await flushOutbox(db, sendOp);
      if (result.groupIds.length > 0) for (const listener of listeners) listener(result.groupIds);
      if (result.stopped) break;
    } while (flushAgain);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

const groupSyncs = new Map<string, Promise<void>>();

/**
 * Sends the outbox, then pulls what changed in the group since its cursor. 404 (I
 * left it, it was deleted) forgets the group locally and rethrows. Concurrent
 * calls for one group share a run.
 */
export function syncGroup(groupId: string): Promise<void> {
  const running = groupSyncs.get(groupId);
  if (running) return running;
  const run = (async () => {
    if (!onlineManager.isOnline()) throw new OfflineError();
    await flushNow();
    const db = await localDatabases.userDb();
    const since = await readSyncCursor(db, groupId);
    try {
      const delta = await parseResponse(
        api.groups[':groupId'].sync.$get({ param: { groupId }, query: since ? { since } : {} }),
      );
      await applyGroupDelta(db, delta as GroupDelta);
    } catch (error) {
      if (isNotFound(error)) await removeGroup(db, groupId);
      throw error;
    }
  })().finally(() => groupSyncs.delete(groupId));
  groupSyncs.set(groupId, run);
  return run;
}

let listSync: Promise<void> | null = null;

/**
 * Sends the outbox, then refreshes the inbox (`GET /groups`). Groups with new
 * activity are then pulled in the background, one at a time, so they can be
 * read offline later.
 */
export function syncGroupList(): Promise<void> {
  listSync ??= (async () => {
    if (!onlineManager.isOnline()) throw new OfflineError();
    await flushNow();
    const db = await localDatabases.userDb();
    const items = (await parseResponse(api.groups.$get())) as CachedGroupListItem[];
    const stale = await groupsNeedingSync(db, items);
    await saveGroupList(db, items);
    void pullInBackground(stale);
  })().finally(() => {
    listSync = null;
  });
  return listSync;
}

async function pullInBackground(groupIds: readonly string[]) {
  for (const groupId of groupIds) {
    try {
      await syncGroup(groupId);
    } catch {
      // Offline again or the group is gone; the next inbox refresh retries.
    }
  }
}

/**
 * Runs a sync whose failure only matters if the cache can't answer: returns
 * the error instead of throwing, except 401 (the query layer signs out).
 */
export async function attemptSync(sync: () => Promise<void>): Promise<unknown> {
  try {
    await sync();
    return null;
  } catch (error) {
    if (isUnauthorized(error)) throw error;
    return error;
  }
}
