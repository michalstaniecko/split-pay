import type { Category, Entry, NewEntry, NewQuickBill } from '@split-pay/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';

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
