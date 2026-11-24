import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { deviceStorage } from '@/lib/device-storage';
import { createGroupSeenStore, isGroupUnread } from './group-unread';

/** When each group's Conversation was last opened on this device (#40). */
export const groupSeen = createGroupSeenStore(deviceStorage);

/** Whether the inbox row is unread, given when others last added an entry. */
export function useGroupUnread(groupId: string, lastEntryByOthersAt: string | null): boolean {
  const lastSeen = useSyncExternalStore(groupSeen.subscribe, () => groupSeen.get(groupId));
  return isGroupUnread(lastEntryByOthersAt, lastSeen);
}

/**
 * Marks the group seen while its Conversation is open: on focus, and again
 * whenever a newer entry shows up (the server's clock may be ahead of the
 * device's — what's been shown counts as seen).
 */
export function useMarkGroupSeen(groupId: string, entries: readonly { createdAt: string }[] | undefined) {
  useFocusEffect(
    useCallback(() => {
      groupSeen.markOpened(groupId, new Date().toISOString());
    }, [groupId]),
  );
  const newest = entries?.reduce<string | null>((max, e) => (max === null || e.createdAt > max ? e.createdAt : max), null);
  useEffect(() => {
    if (newest) groupSeen.markOpened(groupId, newest);
  }, [groupId, newest]);
}
