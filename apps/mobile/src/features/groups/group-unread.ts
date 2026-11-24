/**
 * The inbox unread marker (SPEC "Inbox", #40): a group row is bold with a dot
 * when someone else added an entry after the group was last opened on this
 * device. My own entries never count (the API's `lastEntryByOthersAt` leaves
 * them out). Never opened here → any entry by others counts. No counters.
 */
export function isGroupUnread(lastEntryByOthersAt: string | null, lastSeenAt: string | null): boolean {
  if (lastEntryByOthersAt === null) return false;
  if (lastSeenAt === null) return true;
  return Date.parse(lastEntryByOthersAt) > Date.parse(lastSeenAt);
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const groupLastSeenKey = (groupId: string) => `group.last-seen.${groupId}`;

/**
 * When each group's Conversation was last opened, stored on the device (no
 * API in the MVP — SPEC). Per group it only moves forward: marking an older
 * time (e.g. the newest entry shown, when the server clock is behind the
 * device's) keeps the later one.
 */
export function createGroupSeenStore(storage: KeyValueStorage) {
  const listeners = new Set<() => void>();
  const cached = new Map<string, string | null>();
  const get = (groupId: string): string | null => {
    if (!cached.has(groupId)) cached.set(groupId, storage.getItem(groupLastSeenKey(groupId)));
    return cached.get(groupId) ?? null;
  };
  return {
    get,
    markOpened(groupId: string, at: string) {
      if (Number.isNaN(Date.parse(at))) return;
      const current = get(groupId);
      if (current !== null && Date.parse(current) >= Date.parse(at)) return;
      cached.set(groupId, at);
      storage.setItem(groupLastSeenKey(groupId), at);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
