import { groupKeys } from '@/features/groups/groups-query';
import { queryClient } from '@/lib/query-client';

/**
 * Brings a group up to date after a push (silent or visible) — the MVP's
 * replacement for realtime. Refetches the group's data and the inbox.
 * TODO(#22): run the per-group delta sync here once the offline cache exists.
 */
export async function syncGroup(groupId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
    queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
  ]);
}
