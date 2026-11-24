/**
 * Pure logic of the view-only web (SPEC "Web interface"): the "this is me"
 * choice kept in browser storage and the "download the app" link.
 */

import { groupLinkUrl } from '../group-link/group-link';

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
 * "Open in the app" for a link (group link or personal claim link): the app's
 * deep link to the same token, so the app lands on its join screen — for a
 * personal claim link, straight on claiming that member. A web URL of the same
 * page would only reload it, so this always uses the app's scheme.
 */
export function openInAppUrl(token: string): string {
  return groupLinkUrl(token, undefined);
}

/**
 * The personal claim link banner ("To Twój profil — przejmij go w aplikacji"):
 * the member the link is for, while they are still in the group without an
 * account. `null` = no banner (group link, or already claimed).
 */
export function claimBanner<M extends { id: string; hasAccount: boolean }>(input: {
  claimFor: string | null;
  members: readonly M[];
}): M | null {
  return input.members.find((m) => m.id === input.claimFor && !m.hasAccount) ?? null;
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
