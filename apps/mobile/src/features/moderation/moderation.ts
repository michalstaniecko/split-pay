import { DetailedError } from 'hono/client';

/** Where the root navigator sends the user: sign-in, the app, or only "Konto zablokowane". */
export type SessionArea = 'auth' | 'app' | 'blocked';

/**
 * A blocked account (#27) can sign in, but only to delete itself (#48,
 * ADR-0019). The API says so in `GET /me`; until it answers (offline, error)
 * the last status this device saw decides, so a blocked user never reaches
 * the inbox from the offline cache.
 */
export function sessionArea(
  signedIn: boolean,
  me: { blocked: boolean } | undefined,
  lastKnownBlocked: boolean,
): SessionArea {
  if (!signedIn) return 'auth';
  const blocked = me ? me.blocked : lastKnownBlocked;
  return blocked ? 'blocked' : 'app';
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const BLOCKED_KEY = 'account.blocked-user';

/**
 * The last known blocked status, stored on the device: the id of the blocked
 * account signed in here, if any. Set and cleared from `GET /me`'s answer,
 * cleared on sign-out.
 */
export function createBlockedStatusStore(storage: KeyValueStorage) {
  const listeners = new Set<() => void>();
  let blockedUserId = storage.getItem(BLOCKED_KEY) || null;
  const set = (next: string | null) => {
    if (next === blockedUserId) return;
    blockedUserId = next;
    storage.setItem(BLOCKED_KEY, next ?? '');
    for (const listener of listeners) listener();
  };
  return {
    isBlocked: (userId: string | undefined) => userId !== undefined && userId === blockedUserId,
    remember(userId: string, blocked: boolean) {
      if (blocked) set(userId);
      else if (blockedUserId === userId) set(null);
    },
    forget: () => set(null),
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The API refused a request because the account is blocked (403 `account_blocked`). */
export const isAccountBlockedResponse = (error: unknown) =>
  error instanceof DetailedError &&
  error.statusCode === 403 &&
  (error.detail as { data?: { error?: unknown } } | undefined)?.data?.error === 'account_blocked';

/**
 * The avatar photo a group member's avatar can be reported by (Group info):
 * someone else's current avatar. `null` = nothing to report.
 */
export function reportablePhoto(
  avatars: ReadonlyMap<string, { photoId: string }> | undefined,
  member: { id: string; isMe: boolean },
): string | null {
  if (member.isMe) return null;
  return avatars?.get(member.id)?.photoId ?? null;
}
