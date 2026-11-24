import type { Change } from '@split-pay/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';

export const historyKeys = {
  /** Under the group's detail key: any group invalidation refreshes the history too. */
  all: (groupId: string) => [...groupKeys.detail(groupId), 'history'] as const,
  list: (groupId: string, entryId?: string) => [...historyKeys.all(groupId), entryId ?? 'group'] as const,
};

/** The group's change history, newest first; with `entryId` only that entry's changes. */
export const historyQuery = (groupId: string, entryId?: string) =>
  queryOptions({
    queryKey: historyKeys.list(groupId, entryId),
    queryFn: async () =>
      (await parseResponse(
        api.groups[':groupId'].changes.$get({ param: { groupId }, query: entryId ? { entryId } : {} }),
      )) as Change[],
  });

/**
 * Undoes a change from the history (any member, ADR-0008). Everything in the
 * group may have changed (entries, balances, members, claims, settings), so
 * the whole group and the inbox refresh.
 */
export function useUndoChange(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changeId: string) =>
      (await parseResponse(
        api.groups[':groupId'].changes[':changeId'].undo.$post({ param: { groupId, changeId } }),
      )) as Change,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
      ]);
    },
  });
}
