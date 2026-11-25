import { type Category, type Entry, entryFromNew, type NewEntry, type NewQuickBill } from '@split-pay/shared';
import { onlineManager, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import {
  addLocalEntry,
  createLocalQuickBill,
  deleteLocalEntry,
  editLocalEntry,
  type NewLocalQuickBill,
  restoreLocalEntry,
} from '@/features/offline/local-group-store';
import type { LocalDb } from '@/features/offline/local-db';
import { localGroupsDb, onGroupSource } from '@/features/offline/local-groups';
import { hasCacheUser, cacheDb, cacheUserId } from '@/features/offline/local-session';
import { enqueueCreate, isGroupSynced, readEntries, readGroupDetail, saveEntry } from '@/features/offline/local-store';
import {
  enqueueDelete,
  enqueueEdit,
  enqueueRestore,
  LockedOfflineError,
  mustQueueChange,
} from '@/features/offline/offline-changes';
import { clearConflict, markConflict } from '@/features/offline/outbox';
import { invalidateOutbox } from '@/features/offline/outbox-query';
import { attemptSync, flushNow, syncGroup } from '@/features/offline/sync';
import { api } from '@/lib/api';
import { lockedOffline, versionConflictEntry } from './entry-edit';

/** Entry query keys live under the group's key, so invalidating the group refreshes them too. */
export const entryKeys = {
  list: (groupId: string) => [...groupKeys.detail(groupId), 'entries'] as const,
};

/**
 * The group's live entries in Conversation order, queued ones included —
 * read from the offline cache after a delta sync attempt (ADR-0005); a local
 * group's from the device database (ADR-0021).
 */
export const entriesQuery = (groupId: string) =>
  queryOptions({
    queryKey: entryKeys.list(groupId),
    queryFn: () =>
      onGroupSource(groupId, {
        local: (db) => readEntries(db, groupId),
        synced: async () => {
          if (!hasCacheUser()) throw new Error('Group not found');
          const syncError = await attemptSync(() => syncGroup(groupId));
          const db = await cacheDb();
          if (syncError && !(await isGroupSynced(db, groupId))) throw syncError;
          return readEntries(db, groupId);
        },
      }),
    networkMode: 'always',
  });

/**
 * Entries written to the local group store (ADR-0021): stored for good — no
 * outbox to send, nothing for the server to confirm.
 */
const localResults = new WeakSet<Entry>();

/** A local group's write of an entry (`onGroupSource`'s `local`), its result marked as stored for good. */
const storedLocally =
  (write: (db: LocalDb) => Promise<Entry>) =>
  async (db: LocalDb): Promise<Entry> => {
    const result = await write(db);
    localResults.add(result);
    return result;
  };

/**
 * Adds an entry through the outbox (ADR-0005): it is stored on the device and
 * listed at once (🕓 until the server has it), then sent when online. The
 * caller generates the id once per draft, so resending can't duplicate it.
 * Fails only when the input breaks the `Entry` rules; a refusal by the server
 * shows later as a red "!" on the bubble. In a local group the entry is
 * written straight to the device database, added by the device member.
 */
export function useCreateEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Writes the device database (outbox or local group), so it must also run offline.
    networkMode: 'always',
    mutationFn: (input: NewEntry): Promise<Entry> =>
      onGroupSource(groupId, {
        local: storedLocally((db) => addLocalEntry(db, groupId, input)),
        synced: async () => {
          const db = await cacheDb();
          const createdBy = cacheUserId();
          // "Added by" (ADR-0019): my member in the group; the server sets the same when it gets the entry.
          const members = (await readGroupDetail(db, groupId))?.members ?? [];
          const createdByMember = members.find((m) => m.userId === createdBy)?.id ?? null;
          const parsed = entryFromNew(input, { groupId, createdBy, createdByMember, now: new Date().toISOString() });
          if (!parsed.success) throw parsed.error;
          await enqueueCreate(db, parsed.data);
          return parsed.data;
        },
      }),
    onSuccess: async (entry) => {
      queryClient.setQueryData(entryKeys.list(groupId), (old: Entry[] | undefined) =>
        old && !old.some((e) => e.id === entry.id) ? [...old, entry] : old,
      );
      if (!localResults.has(entry)) void flushNow().catch(() => undefined);
      await invalidateOutbox(queryClient, groupId);
    },
  });
}

/**
 * Runs a change of an existing entry through the outbox when it must wait
 * (offline, or earlier changes of the entry still queued — #23): returns the
 * local result and starts sending; `null` = go straight to the API. Offline,
 * only my own entries can be changed (ADR-0005).
 */
/** Results of changes made through the outbox: already stored locally, nothing to confirm. */
const queuedResults = new WeakSet<Entry>();

async function queuedChange(entry: Entry, change: (db: Awaited<ReturnType<typeof cacheDb>>, now: string) => Promise<Entry>) {
  const db = await cacheDb();
  const online = onlineManager.isOnline();
  if (!(await mustQueueChange(db, entry.id, online))) return null;
  if (lockedOffline(entry, { offline: !online, userId: cacheUserId() })) throw new LockedOfflineError();
  const result = await change(db, new Date().toISOString());
  queuedResults.add(result);
  void flushNow().catch(() => undefined);
  return result;
}

/** Records a change refused as a version conflict: red "!" on the bubble (outbox state, #23 resolves it). */
async function recordConflict(
  queryClient: ReturnType<typeof useQueryClient>,
  groupId: string,
  conflict: { entryId: string; change: 'edit' | 'delete' | 'restore'; baseVersion: number; payload: NewEntry | null; current: Entry },
) {
  await markConflict(await cacheDb(), { groupId, ...conflict });
  await invalidateOutbox(queryClient, groupId);
}

/** Stores the server's copy of a changed entry in the cache and clears its conflict mark. */
async function confirmChange(queryClient: ReturnType<typeof useQueryClient>, groupId: string, entry: Entry) {
  if (queuedResults.has(entry) || localResults.has(entry)) return invalidateOutbox(queryClient, groupId);
  const db = await cacheDb();
  await saveEntry(db, entry);
  await clearConflict(db, entry.id);
  await invalidateOutbox(queryClient, groupId);
}

/** Puts the server's copy of an entry into the cached list (deleted ones leave it). */
function cacheEntry(queryClient: ReturnType<typeof useQueryClient>, groupId: string, entry: Entry) {
  queryClient.setQueryData(entryKeys.list(groupId), (old: Entry[] | undefined) => {
    if (!old) return old;
    const others = old.filter((e) => e.id !== entry.id);
    return entry.deletedAt === null ? [...others, entry] : others;
  });
}

/**
 * Edits an entry (PUT /groups/:groupId/entries/:entryId) based on the cached
 * version `base`. A 409 version conflict marks the entry in the outbox
 * (red "!" on the bubble, persisted in the outbox) and leaves the cache alone; the error is still
 * thrown to the caller (use `versionConflictEntry(error)`).
 * Offline (or behind queued changes of the entry) the edit is queued instead
 * and resolves to my local version (🕓 on the bubble). In a local group any
 * entry is edited straight in the device database — no versions, no conflicts.
 */
export function useEditEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Writes the device database (outbox or local group), so it must also run offline.
    networkMode: 'always',
    mutationFn: ({ base, input }: { base: Entry; input: NewEntry }): Promise<Entry> =>
      onGroupSource(groupId, {
        local: storedLocally((db) => editLocalEntry(db, base, input)),
        synced: async () =>
          (await queuedChange(base, (db, now) => enqueueEdit(db, base, input, now))) ??
          parseResponse(
            api.groups[':groupId'].entries[':entryId'].$put({
              param: { groupId, entryId: base.id },
              json: { baseVersion: base.version, entry: input },
            }),
          ),
      }),
    onSuccess: async (entry) => {
      cacheEntry(queryClient, groupId, entry);
      await confirmChange(queryClient, groupId, entry);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entryKeys.list(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
      ]);
    },
    onError: async (error, { base, input }) => {
      const current = versionConflictEntry(error);
      if (current) {
        await recordConflict(queryClient, groupId, {
          entryId: base.id,
          change: 'edit',
          baseVersion: base.version,
          payload: input,
          current,
        });
      }
    },
  });
}

/**
 * Soft-deletes an entry (DELETE …/entries/:entryId?baseVersion=). Optimistic:
 * the bubble leaves the list at once and comes back on failure (a version
 * conflict also marks it). Resolves to the deleted entry — what "Cofnij"
 * (`useRestoreEntry`) needs. In a local group, straight in the device database.
 */
export function useDeleteEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Writes the device database (outbox or local group), so it must also run offline.
    networkMode: 'always',
    mutationFn: (entry: Entry): Promise<Entry> =>
      onGroupSource(groupId, {
        local: storedLocally((db) => deleteLocalEntry(db, entry)),
        synced: async () =>
          (await queuedChange(entry, (db, now) => enqueueDelete(db, entry, now))) ??
          parseResponse(
            api.groups[':groupId'].entries[':entryId'].$delete({
              param: { groupId, entryId: entry.id },
              query: { baseVersion: String(entry.version) },
            }),
          ),
      }),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: entryKeys.list(groupId) });
      queryClient.setQueryData(entryKeys.list(groupId), (old: Entry[] | undefined) =>
        old?.filter((e) => e.id !== entry.id),
      );
    },
    onSuccess: (deleted) => confirmChange(queryClient, groupId, deleted),
    onError: async (error, entry) => {
      const current = versionConflictEntry(error);
      if (current) {
        await recordConflict(queryClient, groupId, {
          entryId: entry.id,
          change: 'delete',
          baseVersion: entry.version,
          payload: null,
          current,
        });
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entryKeys.list(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
      ]);
    },
  });
}

/** "Cofnij" after a delete: restores the entry (POST …/entries/:entryId/restore) based on its deleted version. */
export function useRestoreEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Writes the device database (outbox or local group), so it must also run offline.
    networkMode: 'always',
    mutationFn: (deleted: Entry): Promise<Entry> =>
      onGroupSource(groupId, {
        local: storedLocally((db) => restoreLocalEntry(db, deleted)),
        synced: async () =>
          (await queuedChange(deleted, (db, now) => enqueueRestore(db, deleted, now))) ??
          parseResponse(
            api.groups[':groupId'].entries[':entryId'].restore.$post({
              param: { groupId, entryId: deleted.id },
              json: { baseVersion: deleted.version },
            }),
          ),
      }),
    onSuccess: async (entry) => {
      cacheEntry(queryClient, groupId, entry);
      await confirmChange(queryClient, groupId, entry);
    },
    onError: async (error, deleted) => {
      const current = versionConflictEntry(error);
      if (current) {
        await recordConflict(queryClient, groupId, {
          entryId: deleted.id,
          change: 'restore',
          baseVersion: deleted.version,
          payload: null,
          current,
        });
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entryKeys.list(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
      ]);
    },
  });
}

/**
 * Creates a quick bill: group, members without an account and its expense in
 * one step. A `NewLocalQuickBill` (signed out) becomes a local group in the
 * device database (ADR-0021); signed in, quick bills are always synced (POST /quick-bills).
 */
export function useCreateQuickBill() {
  const queryClient = useQueryClient();
  return useMutation({
    // A local quick bill goes to the device database, so it must also run offline.
    networkMode: 'always',
    mutationFn: async (input: NewQuickBill | NewLocalQuickBill): Promise<{ group: { id: string } }> => {
      if ('deviceMember' in input) return createLocalQuickBill(await localGroupsDb(), input);
      return parseResponse(api['quick-bills'].$post({ json: input }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
}

/** Category icons (Fresh: emoji). TODO: Classic's monochrome glyphs come with theme tokens (SPEC "Look and feel"). */
export const CATEGORY_ICONS: Record<Category, string> = {
  groceries: '🛒',
  food: '🍕',
  transport: '🚆',
  fuel: '⛽',
  accommodation: '🏠',
  alcohol: '🍺',
  entertainment: '🎟️',
  other: '🧾',
};
