import { QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';
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
 * Signed-in users see the app, everyone else the sign-in flow. Signing in or
 * out flips the guards; Expo Router then swaps the stacks (no manual redirect).
 */
function RootNavigator() {
  const { data: session, isPending } = authClient.useSession();
  // The splash screen covers the moment before the stored session is read.
  useEffect(() => {
    if (!isPending) SplashScreen.hide();
  }, [isPending]);

  const signedIn = !!session;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
