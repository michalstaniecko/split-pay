import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';
import { blockedStatus } from '@/features/moderation/blocked-status-store';
import { useSessionArea } from '@/features/moderation/use-session-area';
import { meQuery } from '@/features/profile/me-query';
import { LocaleProvider } from '@/i18n/locale-provider';
import { authClient } from '@/lib/auth-client';
import { setErrorReportingUser } from '@/lib/error-reporting';
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
  const userId = session?.user.id;
  // Error reports carry only the user id (#64).
  useEffect(() => setErrorReportingUser(userId), [userId]);
  const me = useQuery({ ...meQuery(), enabled: signedIn });
  // The splash screen covers reading the stored session and, when online,
  // the API's answer whether the account is blocked.
  const checkingBlock = signedIn && me.isPending && me.fetchStatus === 'fetching';
  useEffect(() => {
    if (!isPending && !checkingBlock) SplashScreen.hide();
  }, [isPending, checkingBlock]);

  // Offline or on an error, the status this device last saw keeps a blocked
  // user out of the inbox (the offline cache would otherwise show it).
  const area = useSessionArea({ pending: isPending, userId }, me.data, blockedStatus);
  // Where a guarded route sends the user instead (e.g. the app's start URL "/" while signed out).
  const home = area === 'auth' ? '/sign-in' : area === 'blocked' ? '/blocked' : '/';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={area === 'app'} redirectTo={home}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'auth'} redirectTo={home}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'blocked'} redirectTo={home}>
        <Stack.Screen name="blocked" />
      </Stack.Protected>
      <Stack.Protected guard={area !== 'blocked'} redirectTo={home}>
        <Stack.Screen name="g/[token]" />
      </Stack.Protected>
    </Stack>
  );
}
