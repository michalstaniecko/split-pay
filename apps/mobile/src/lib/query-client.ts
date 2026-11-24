import { focusManager, MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { DetailedError } from 'hono/client';
import { AppState, Platform } from 'react-native';
import { isAccountBlockedResponse } from '@/features/moderation/moderation';
import { authClient } from './auth-client';

const isUnauthorized = (error: unknown) => error instanceof DetailedError && error.statusCode === 401;

/**
 * The API no longer accepts the session (expired or revoked): drop it
 * locally; the root layout's guard then shows the sign-in screen. The account
 * got blocked (#48): refetch `/me`, so the guard shows "Konto zablokowane".
 */
const onAccountBlocked = (error: unknown) => {
  if (isAccountBlockedResponse(error)) void queryClient.invalidateQueries({ queryKey: ['me'] });
};

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isUnauthorized(error)) void authClient.signOut();
      else onAccountBlocked(error);
    },
  }),
  mutationCache: new MutationCache({ onError: onAccountBlocked }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !isUnauthorized(error) && !isAccountBlockedResponse(error) && failureCount < 1,
    },
  },
});

// React Native has no window focus/online events; wire TanStack Query to the
// app state and the network state instead (TanStack docs, React Native page).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));

  onlineManager.setEventListener((setOnline) => {
    const update = (state: Network.NetworkState) => setOnline(state.isConnected !== false);
    void Network.getNetworkStateAsync().then(update);
    const subscription = Network.addNetworkStateListener(update);
    return () => subscription.remove();
  });
}
