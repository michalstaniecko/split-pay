import { useEffect, useSyncExternalStore } from 'react';
import { type createBlockedStatusStore, type SessionArea, sessionArea } from './moderation';

type BlockedStatusStore = ReturnType<typeof createBlockedStatusStore>;
type Session = { pending: boolean; userId: string | undefined };

/**
 * Keeps `store` in step with the session: `GET /me`'s answer sets or clears
 * the user's blocked status, signing out forgets it. Offline or on an error
 * (`me` undefined) the store is left as it is.
 */
export function syncBlockedStatus(
  { pending, userId }: Session,
  me: { blocked: boolean } | undefined,
  store: BlockedStatusStore,
): void {
  if (userId && me) store.remember(userId, me.blocked);
  else if (!pending && !userId) store.forget();
}

/**
 * Where the root layout routes the session (#48): sign-in, the app, or only
 * "Konto zablokowane". Offline or on an error (`me` undefined), the status
 * this device last saw keeps a blocked user out of the inbox. Keeps `store`
 * in step through `syncBlockedStatus`.
 */
export function useSessionArea(
  session: Session,
  me: { blocked: boolean } | undefined,
  store: BlockedStatusStore,
): SessionArea {
  const { pending, userId } = session;
  useEffect(() => {
    syncBlockedStatus({ pending, userId }, me, store);
  }, [store, pending, userId, me]);
  const isBlocked = () => store.isBlocked(userId);
  const lastKnownBlocked = useSyncExternalStore(store.subscribe, isBlocked, isBlocked);
  return sessionArea(userId !== undefined, me, lastKnownBlocked);
}
