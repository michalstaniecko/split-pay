import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { authClient } from '@/lib/auth-client';
import { selectLocalUser } from './local-session';
import { invalidateOutbox } from './outbox-query';
import { flushNow, onOutboxSent } from './sync';

/**
 * Wires the offline cache into the signed-in app (call once, in the `(app)`
 * layout): selects the user's local database before any screen queries it,
 * sends the outbox on start and whenever the connection comes back, and
 * refreshes the bubbles of groups whose operations were sent.
 */
export function useOfflineSync(): void {
  const userId = authClient.useSession().data?.user.id;
  // During render on purpose: child screens query the cache in their first render.
  if (userId) selectLocalUser(userId);
  const queryClient = useQueryClient();

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
