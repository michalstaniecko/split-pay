import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { authClient } from '@/lib/auth-client';
import { deselectUserCache, selectUserCache } from './local-session';
import { invalidateOutbox } from './outbox-query';
import { flushNow, onOutboxSent } from './sync';

/**
 * Wires the offline cache into the app (call once, in the `(app)` layout):
 * selects the signed-in user's local database before any screen queries it
 * (none while signed out), re-reads every query when someone signs in or out,
 * sends the outbox on start and whenever the connection comes back, and
 * refreshes the bubbles of groups whose operations were sent.
 */
export function useOfflineSync(): void {
  const userId = authClient.useSession().data?.user.id;
  // During render on purpose: child screens query the cache in their first render.
  // Signed out (local groups only, ADR-0021) no user's cache is in use.
  if (userId) selectUserCache(userId);
  else deselectUserCache();
  const queryClient = useQueryClient();

  // Signing in or out while the app is open (local groups stay on screen,
  // ADR-0021): the inbox and everything read for the previous account (or
  // none) is read again from the right databases.
  const shownFor = useRef(userId);
  useEffect(() => {
    if (shownFor.current === userId) return;
    shownFor.current = userId;
    void queryClient.resetQueries();
  }, [userId, queryClient]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribeSent = onOutboxSent((groupIds) => {
      for (const groupId of groupIds) void invalidateOutbox(queryClient, groupId);
    });
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) void flushNow().catch(() => undefined);
    });
    void flushNow().catch(() => undefined);
    return () => {
      unsubscribeSent();
      unsubscribeOnline();
    };
  }, [userId, queryClient]);
}

/** Whether the device has a connection (TanStack's online manager, fed by expo-network). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => onlineManager.isOnline(),
  );
}
