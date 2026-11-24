import { useEffect, useSyncExternalStore } from 'react';
import { type createBlockedStatusStore, type SessionArea, sessionArea } from './moderation';

type BlockedStatusStore = ReturnType<typeof createBlockedStatusStore>;

/**
 * Where the root layout routes the session (#48): sign-in, the app, or only
 * "Konto zablokowane". Offline or on an error (`me` undefined), the status
 * this device last saw keeps a blocked user out of the inbox. Keeps `store`
 * in step: `GET /me`'s answer sets or clears it, signing out clears it.
 */
export function useSessionArea(
  session: { pending: boolean; userId: string | undefined },
  me: { blocked: boolean } | undefined,
  store: BlockedStatusStore,
): SessionArea {
  const { pending, userId } = session;
  useEffect(() => {
    if (userId && me) store.remember(userId, me.blocked);
  }, [store, userId, me]);
  useEffect(() => {
    if (!pending && !userId) store.forget();
  }, [store, pending, userId]);
  const isBlocked = () => store.isBlocked(userId);
  const lastKnownBlocked = useSyncExternalStore(store.subscribe, isBlocked, isBlocked);
  return sessionArea(userId !== undefined, me, lastKnownBlocked);
}
