import { useLingui } from '@lingui/react/macro';
import { Stack } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';
import { InboxHeaderButtons } from '@/components/inbox-header-buttons';
import { usePendingJoin } from '@/features/group-link/use-pending-join';
import { usePushNotifications } from '@/features/notifications/push';
import { useOfflineSync } from '@/features/offline/use-offline-sync';
import { authClient } from '@/lib/auth-client';

/** Deep links (group link → Conversation) keep the inbox underneath, so "back" leads home. */
export const unstable_settings = { anchor: 'index' };

/**
 * The app: one native stack, no tabs (ADR-0017). The inbox is home;
 * Activity and Profile are pushed from its header; creating things happens in
 * sheets/modals declared here. Signed out ("Kontynuuj bez konta", ADR-0021)
 * only local groups are reachable, and nothing here calls the API.
 */
export default function AppLayout() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const signedIn = !!authClient.useSession().data;
  useOfflineSync();
  return (
    <>
      {signedIn ? <AccountEffects /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}>
        <Stack.Screen name="index" options={{ title: 'Kwitz', headerRight: () => <InboxHeaderButtons /> }} />
        <Stack.Screen
          name="new"
          options={{
            title: t`Nowy`,
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
        <Stack.Screen name="new-group" options={{ title: t`Nowa grupa`, presentation: 'modal' }} />
        <Stack.Screen
          name="quick-bill"
          options={{
            title: t`Szybki rachunek`,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1],
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
        <Stack.Screen name="groups/[groupId]/index" options={{ title: '' }} />
        <Stack.Screen
          name="groups/[groupId]/expense-form"
          options={{
            title: t`Nowy wydatek`,
            presentation: 'formSheet',
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="groups/[groupId]/entries/[entryId]"
          options={{
            title: t`Wpis`,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="groups/[groupId]/balances"
          options={{
            title: t`Salda`,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1],
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="groups/[groupId]/settle"
          options={{
            title: t`Oddaj`,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
        <Stack.Screen name="groups/[groupId]/info" options={{ title: t`Informacje o grupie` }} />
        {/*
          What needs an account (the API, the user's cache or its outbox): signed
          out (ADR-0021), not even a deep link reaches it.
        */}
        <Stack.Protected guard={signedIn} redirectTo="/">
          <Stack.Screen
            name="groups/[groupId]/entry-conflict"
            options={{
              title: t`Konflikt zmian`,
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="groups/[groupId]/unsent-entry"
            options={{
              title: t`Nie wysłano`,
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              headerShown: false,
            }}
          />
          {/* Receipt photo viewer (#26), black full screen with its own close button. */}
          <Stack.Screen
            name="groups/[groupId]/receipt"
            options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }}
          />
          <Stack.Screen name="activity" options={{ title: t`Aktywność` }} />
          <Stack.Screen name="profile" options={{ title: t`Profil` }} />
          <Stack.Screen name="groups/[groupId]/stats" options={{ title: t`Statystyki` }} />
          <Stack.Screen name="groups/[groupId]/history" options={{ title: t`Historia zmian` }} />
          {/* Content reporting + admin panel (#27). */}
          <Stack.Screen
            name="report-photo"
            options={{
              title: t`Zgłoś zdjęcie`,
              presentation: 'formSheet',
              sheetAllowedDetents: [0.75, 1],
              sheetGrabberVisible: true,
              headerShown: false,
            }}
          />
          <Stack.Screen name="admin" options={{ title: t`Panel administratora` }} />
        </Stack.Protected>
        <Stack.Screen
          name="groups/[groupId]/member"
          options={{
            title: t`Osoba`,
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

/** What only an account has: pending group-link joins and push notifications. */
function AccountEffects() {
  usePendingJoin();
  usePushNotifications();
  return null;
}
