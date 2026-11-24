import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';
import { useLastKnownBlocked } from '@/features/moderation/blocked-status-store';
import { sessionArea } from '@/features/moderation/moderation';
import { meQuery } from '@/features/profile/me-query';
import { LocaleProvider } from '@/i18n/locale-provider';
import { authClient } from '@/lib/auth-client';
import { queryClient } from '@/lib/query-client';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </LocaleProvider>
  );
}

/**
 * Signed-in users see the app, everyone else the sign-in flow. A blocked
 * account (#48) sees only "Konto zablokowane" — no inbox, no group links.
 * Signing in or out, or the API reporting the block, flips the guards; Expo
 * Router then swaps the stacks (no manual redirect).
 */
function RootNavigator() {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = !!session;
  const me = useQuery({ ...meQuery(), enabled: signedIn });
  // The splash screen covers reading the stored session and, when online,
  // the API's answer whether the account is blocked.
  const checkingBlock = signedIn && me.isPending && me.fetchStatus === 'fetching';
  useEffect(() => {
    if (!isPending && !checkingBlock) SplashScreen.hide();
  }, [isPending, checkingBlock]);

  // Offline or on an error, the status this device last saw keeps a blocked
  // user out of the inbox (the offline cache would otherwise show it).
  const lastKnownBlocked = useLastKnownBlocked({ pending: isPending, userId: session?.user.id }, me.data);
  const area = sessionArea(signedIn, me.data, lastKnownBlocked);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={area === 'app'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'auth'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'blocked'}>
        <Stack.Screen name="blocked" />
      </Stack.Protected>
      <Stack.Protected guard={area !== 'blocked'}>
        <Stack.Screen name="g" />
      </Stack.Protected>
    </Stack>
  );
}
