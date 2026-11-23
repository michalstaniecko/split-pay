import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { pendingJoin } from './group-link';

/**
 * After signing in, opens the join screen for a group link that arrived while
 * signed out (see `pendingJoin`). Called once by the signed-in app layout.
 */
export function usePendingJoin() {
  const pathname = usePathname();
  // Only on mount (= right after signing in, or app start while signed in).
  useEffect(() => {
    const token = pendingJoin.take();
    if (token && pathname !== `/g/${token}`) router.push({ pathname: '/g/[token]', params: { token } });
  }, []);
}
