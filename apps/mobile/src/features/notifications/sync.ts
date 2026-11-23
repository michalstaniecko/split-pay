import { groupKeys } from '@/features/groups/groups-query';
import { syncGroup as pullGroup } from '@/features/offline/sync';
import { queryClient } from '@/lib/query-client';

/**
 * Brings a group up to date after a push (silent or visible) — the MVP's
 * replacement for realtime. Runs the group's delta sync into the offline
 * cache (#22) — also in the background, where no screen observes the queries —
 * then refreshes the group's queries and the inbox so open screens re-read the
 * cache. The refresh runs even if the pull failed (offline, group gone).
 */
export async function syncGroup(groupId: string): Promise<void> {
  try {
    await pullGroup(groupId);
  } finally {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
      queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
    ]);
  }
}
