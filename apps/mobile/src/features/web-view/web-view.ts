/**
 * Pure logic of the view-only web (SPEC "Web interface"): the "this is me"
 * choice kept in browser storage and the "download the app" link.
 */

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const keyOf = (groupId: string) => `web.this-is-me.${groupId}`;

/**
 * "This is me": which member the visitor is, per group, remembered in the
 * given storage (localStorage on web). Subscribers hear every change, so all
 * open screens (Conversation, drawer, Group info) follow the choice.
 */
export function createThisIsMeStore(storage: KeyValueStorage) {
  const listeners = new Set<() => void>();
  return {
    /** `undefined` = never chosen, `null` = "none of them". */
    get(groupId: string): string | null | undefined {
      const value = storage.getItem(keyOf(groupId));
      return value === null ? undefined : value || null;
    },
    set(groupId: string, memberId: string | null) {
      storage.setItem(keyOf(groupId), memberId ?? '');
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * The member the web view treats as "me": the remembered choice if that
 * member is still in the group; before any choice, the member a personal
 * claim link is for.
 */
export function effectiveMe(input: {
  stored: string | null | undefined;
  claimFor: string | null;
  members: readonly { id: string }[];
}): string | null {
  const known = (id: string | null) => (id !== null && input.members.some((m) => m.id === id) ? id : null);
  return input.stored === undefined ? known(input.claimFor) : known(input.stored);
}

/**
 * Where "download the app" leads: the store of the visitor's phone, else
 * (desktop, or a store listing not configured yet) the fallback page.
 */
export function downloadAppUrl(
  userAgent: string,
  links: { appStore?: string | undefined; playStore?: string | undefined; fallback: string },
): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return links.appStore || links.fallback;
  if (/Android/i.test(userAgent)) return links.playStore || links.fallback;
  return links.fallback;
}
