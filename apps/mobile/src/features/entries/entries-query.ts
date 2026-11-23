import type { Category, Entry, NewEntry, NewQuickBill } from '@split-pay/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';
import { entryConflicts } from './entry-conflicts';
import { versionConflictEntry } from './entry-edit';

/** Entry query keys live under the group's key, so invalidating the group refreshes them too. */
export const entryKeys = {
  list: (groupId: string) => [...groupKeys.detail(groupId), 'entries'] as const,
};

/** The group's live entries in Conversation order (GET /groups/:groupId/entries). */
export const entriesQuery = (groupId: string) =>
  queryOptions({
    queryKey: entryKeys.list(groupId),
    queryFn: async (): Promise<Entry[]> =>
      parseResponse(api.groups[':groupId'].entries.$get({ param: { groupId } })),
  });

/**
 * Creates an entry (POST /groups/:groupId/entries). The caller generates the
 * id once per draft, so a retry after a lost response can't duplicate it.
 * Refreshes the group's entries and the inbox (order + preview).
 */
export function useCreateEntry(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewEntry): Promise<Entry> =>
      parseResponse(api.groups[':groupId'].entries.$post({ param: { groupId }, json: input })),
    onSuccess: async (entry) => {
      // Show it right away; the refetch below confirms the order.
      queryClient.setQueryData(entryKeys.list(groupId), (old: Entry[] | undefined) =>
        old && !old.some((e) => e.id === entry.id) ? [...old, entry] : old,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entryKeys.list(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
      ]);
    },
  });
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
 * version `base`. A 409 version conflict marks the entry in `entryConflicts`
 * (red "!" on the bubble) and leaves the cache alone; the error is still
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
      entryConflicts.resolve(groupId, entry.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entryKeys.list(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
      ]);
    },
    onError: (error, { base }) => {
      const current = versionConflictEntry(error);
      if (current) entryConflicts.mark(groupId, { entryId: base.id, change: 'edit', current });
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
    onError: (error, entry) => {
      const current = versionConflictEntry(error);
      if (current) entryConflicts.mark(groupId, { entryId: entry.id, change: 'delete', current });
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
    onSuccess: (entry) => cacheEntry(queryClient, groupId, entry),
    onError: (error, deleted) => {
      const current = versionConflictEntry(error);
      if (current) entryConflicts.mark(groupId, { entryId: deleted.id, change: 'restore', current });
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
