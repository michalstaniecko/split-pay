import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { groupKeys } from '@/features/groups/groups-query';
import { onGroupSource } from './local-groups';
import { cacheDb } from './local-session';
import { discardOutbox, type OutboxEntryState, readOutboxState, retryOutbox } from './outbox';
import { flushNow } from './sync';

export const outboxKeys = {
  group: (groupId: string) => [...groupKeys.detail(groupId), 'outbox'] as const,
};

const EMPTY: ReadonlyMap<string, OutboxEntryState> = new Map();

/**
 * The group's entries with an outbox state (🕓 queued, red "!" failed / conflict),
 * from the local database. A local group has no outbox (ADR-0021).
 */
export const outboxQuery = (groupId: string) =>
  queryOptions({
    queryKey: outboxKeys.group(groupId),
    queryFn: () =>
      onGroupSource(groupId, {
        local: async () => EMPTY,
        synced: async () => readOutboxState(await cacheDb(), groupId),
      }),
    networkMode: 'always',
  });

/** Entry id → outbox state for the group's bubbles (empty while loading). */
export function useOutboxState(groupId: string): ReadonlyMap<string, OutboxEntryState> {
  return useQuery(outboxQuery(groupId)).data ?? EMPTY;
}

/** Refreshes what reads the outbox or the cached entries of a group. */
export function invalidateOutbox(queryClient: ReturnType<typeof useQueryClient>, groupId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: outboxKeys.group(groupId) }),
    queryClient.invalidateQueries({ queryKey: [...groupKeys.detail(groupId), 'entries'] }, { cancelRefetch: false }),
    queryClient.invalidateQueries({ queryKey: groupKeys.list() }, { cancelRefetch: false }),
  ]);
}

/** The red "!" sheet's "Spróbuj ponownie": requeue the entry's refused operations and send. */
export function useRetryOutbox(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      await retryOutbox(await cacheDb(), entryId);
      await flushNow();
    },
    onSettled: () => invalidateOutbox(queryClient, groupId),
  });
}

/** Drops the entry's outbox operations (an unsent new entry leaves this device). */
export function useDiscardOutbox(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => discardOutbox(await cacheDb(), entryId),
    onSettled: () => invalidateOutbox(queryClient, groupId),
  });
}
