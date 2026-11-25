import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { cacheDb } from './local-session';
import { type ConflictVersions, keepMine, keepTheirs, readConflict } from './offline-changes';
import { invalidateOutbox, outboxKeys } from './outbox-query';
import { flushNow } from './sync';

/** The entry's version conflict with both versions (`null` = none / resolved), for the resolution sheet. */
export const conflictQuery = (groupId: string, entryId: string) =>
  queryOptions({
    queryKey: [...outboxKeys.group(groupId), 'conflict', entryId] as const,
    queryFn: async (): Promise<ConflictVersions | null> => readConflict(await cacheDb(), entryId),
    networkMode: 'always',
  });

/** "Zachowaj moją wersję": my change goes back to the queue against the current version, then is sent. */
export function useKeepMine(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      await keepMine(await cacheDb(), entryId);
      void flushNow().catch(() => undefined);
    },
    onSettled: () => invalidateOutbox(queryClient, groupId),
  });
}

/** "Zachowaj ich wersję": my change is dropped and the current version shown. */
export function useKeepTheirs(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => keepTheirs(await cacheDb(), entryId),
    onSettled: () => invalidateOutbox(queryClient, groupId),
  });
}
