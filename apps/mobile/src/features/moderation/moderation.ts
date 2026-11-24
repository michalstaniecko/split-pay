import { DetailedError } from 'hono/client';

/** Where the root navigator sends the user: sign-in, the app, or only "Konto zablokowane". */
export type SessionArea = 'auth' | 'app' | 'blocked';

/**
 * A blocked account (#27) can sign in, but only to delete itself (#48,
 * ADR-0019). The API says so in `GET /me`; until it answers (or offline) the
 * app shows as usual — the API rejects everything else from a blocked session anyway.
 */
export function sessionArea(signedIn: boolean, me: { blocked: boolean } | undefined): SessionArea {
  if (!signedIn) return 'auth';
  return me?.blocked ? 'blocked' : 'app';
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
