import { type Category, type Entry, entryFromNew, type NewEntry, type NewQuickBill } from '@split-pay/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { localDb, localUserId } from '@/features/offline/local-session';
import { enqueueCreate, isGroupSynced, readEntries, saveEntry } from '@/features/offline/local-store';
import { clearConflict, markConflict } from '@/features/offline/outbox';
import { invalidateOutbox } from '@/features/offline/outbox-query';
import { attemptSync, flushNow, syncGroup } from '@/features/offline/sync';
import { api } from '@/lib/api';
import { versionConflictEntry } from './entry-edit';

/** Entry query keys live under the group's key, so invalidating the group refreshes them too. */
export const entryKeys = {
  list: (groupId: string) => [...groupKeys.detail(groupId), 'entries'] as const,
};

/**
 * The group's live entries in Conversation order, queued ones included —
 * read from the offline cache after a delta sync attempt (ADR-0005).
 */
export const entriesQuery = (groupId: string) =>
  queryOptions({
    queryKey: entryKeys.list(groupId),
    queryFn: async (): Promise<Entry[]> => {
      const syncError = await attemptSync(() => syncGroup(groupId));
      const db = await localDb();
      if (syncError && !(await isGroupSynced(db, groupId))) throw syncError;
      return readEntries(db, groupId);
    },
    networkMode: 'always',
  });

/**
 * Adds an entry through the outbox (ADR-0005): it is stored on the device and
 * listed at once (🕓 until the server has it), then sent when online. The
 * caller generates the id once per draft, so resending can't duplicate it.
 * Fails only when the input breaks the `Entry` rules; a refusal by the server
 * shows later as a red "!" on the bubble.
 */
export function useCreateEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewEntry): Promise<Entry> => {
      const parsed = entryFromNew(input, { groupId, createdBy: localUserId(), now: new Date().toISOString() });
      if (!parsed.success) throw parsed.error;
      await enqueueCreate(await localDb(), parsed.data);
      return parsed.data;
    },
    onSuccess: async (entry) => {
      queryClient.setQueryData(entryKeys.list(groupId), (old: Entry[] | undefined) =>
        old && !old.some((e) => e.id === entry.id) ? [...old, entry] : old,
      );
      void flushNow().catch(() => undefined);
      await invalidateOutbox(queryClient, groupId);
    },
  });
}

/** Records a change refused as a version conflict: red "!" on the bubble (outbox state, #23 resolves it). */
async function recordConflict(
  queryClient: ReturnType<typeof useQueryClient>,
  groupId: string,
  conflict: { entryId: string; change: 'edit' | 'delete' | 'restore'; baseVersion: number; payload: NewEntry | null; current: Entry },
) {
  await markConflict(await localDb(), { groupId, ...conflict });
  await invalidateOutbox(queryClient, groupId);
}

/** Stores the server's copy of a changed entry in the cache and clears its conflict mark. */
async function confirmChange(queryClient: ReturnType<typeof useQueryClient>, groupId: string, entry: Entry) {
  const db = await localDb();
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
 */
export function useEditEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ base, input }: { base: Entry; input: NewEntry }): Promise<Entry> =>
      parseResponse(
        api.groups[':groupId'].entries[':entryId'].$put({
          param: { groupId, entryId: base.id },
          json: { baseVersion: base.version, entry: input },
        }),
      ),
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
 * (`useRestoreEntry`) needs.
 */
export function useDeleteEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Entry): Promise<Entry> =>
      parseResponse(
        api.groups[':groupId'].entries[':entryId'].$delete({
          param: { groupId, entryId: entry.id },
          query: { baseVersion: String(entry.version) },
        }),
      ),
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
    mutationFn: async (deleted: Entry): Promise<Entry> =>
      parseResponse(
        api.groups[':groupId'].entries[':entryId'].restore.$post({
          param: { groupId, entryId: deleted.id },
          json: { baseVersion: deleted.version },
        }),
      ),
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

/** Creates a quick bill (POST /quick-bills): group, members without an account and its expense in one step. */
export function useCreateQuickBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewQuickBill) => parseResponse(api['quick-bills'].$post({ json: input })),
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
