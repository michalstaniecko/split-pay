import { useEffect, useSyncExternalStore } from 'react';
import { deviceStorage } from '@/lib/device-storage';
import { createBlockedStatusStore } from './moderation';

/** The last known blocked status of the account signed in on this device (#48). */
export const blockedStatus = createBlockedStatusStore(deviceStorage);

/**
 * Whether the device last saw this account blocked. Keeps the stored status
 * in step: `GET /me`'s answer sets or clears it, signing out clears it.
 */
export function useLastKnownBlocked(
  session: { pending: boolean; userId: string | undefined },
  me: { blocked: boolean } | undefined,
): boolean {
  const { pending, userId } = session;
  useEffect(() => {
    if (userId && me) blockedStatus.remember(userId, me.blocked);
  }, [userId, me]);
  useEffect(() => {
    if (!pending && !userId) blockedStatus.forget();
  }, [pending, userId]);
  return useSyncExternalStore(blockedStatus.subscribe, () => blockedStatus.isBlocked(userId));
}
