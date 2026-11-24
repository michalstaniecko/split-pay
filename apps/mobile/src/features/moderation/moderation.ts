import { ACCOUNT_BLOCKED } from '@split-pay/shared';

/** Sign-in refused because an admin blocked the account (#27). */
export const isAccountBlockedError = (error: { status?: number; code?: string | undefined } | null | undefined) =>
  error?.code === ACCOUNT_BLOCKED;

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
