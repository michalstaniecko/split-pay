import type { ActivityItem, ActivityPage } from '@split-pay/shared';

/**
 * The bell's unread dot (SPEC "Inbox"): someone else changed something after
 * Activity was last opened on this device (never opened → any change by
 * others counts).
 */
export function hasUnreadActivity(latestByOthersAt: string | null, lastOpenedAt: string | null): boolean {
  if (latestByOthersAt === null) return false;
  if (lastOpenedAt === null) return true;
  return Date.parse(latestByOthersAt) > Date.parse(lastOpenedAt);
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const ACTIVITY_LAST_OPENED_KEY = 'activity.last-opened';

/**
 * When Activity was last opened, stored on the device (no API — SPEC). Only
 * moves forward: marking an older time (e.g. the newest change in the feed,
 * when the server clock is behind the device's) keeps the later one.
 */
export function createActivitySeenStore(storage: KeyValueStorage) {
  const listeners = new Set<() => void>();
  let cached = storage.getItem(ACTIVITY_LAST_OPENED_KEY);
  return {
    get: (): string | null => cached,
    markOpened(at: string) {
      if (Number.isNaN(Date.parse(at))) return;
      if (cached !== null && Date.parse(cached) >= Date.parse(at)) return;
      cached = at;
      storage.setItem(ACTIVITY_LAST_OPENED_KEY, at);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The loaded pages as one list (newest first) and all their member names. */
export function flattenActivityPages(pages: readonly ActivityPage[]): {
  items: ActivityItem[];
  memberNames: Record<string, string>;
} {
  const seen = new Set<string>();
  const items: ActivityItem[] = [];
  const memberNames: Record<string, string> = {};
  for (const page of pages) {
    Object.assign(memberNames, page.memberNames);
    for (const item of page.items) {
      // Pages are cursor-based, but a refetch may shift them; never show an item twice.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items, memberNames };
}

/**
 * Where tapping an Activity item goes: the group's Conversation, scrolled to
 * the entry's bubble when the change is about an entry that is still there
 * (a deleted entry has no bubble).
 */
export function activityTarget(item: ActivityItem): { groupId: string; entryId?: string } {
  switch (item.kind) {
    case 'entry.create':
    case 'entry.edit':
    case 'entry.restore':
      return { groupId: item.groupId, entryId: item.targetId };
    default:
      return { groupId: item.groupId };
  }
}

/** The list index of an entry's bubble in the Conversation, or `null` if it isn't shown. */
export function entryItemIndex(
  items: readonly { type: string; entry?: { id: string } }[],
  entryId: string | undefined,
): number | null {
  if (!entryId) return null;
  const index = items.findIndex((item) => item.type === 'entry' && item.entry?.id === entryId);
  return index === -1 ? null : index;
}
