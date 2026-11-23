import { useLingui } from '@lingui/react/macro';
import { Stack } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';
import { InboxHeaderButtons } from '@/components/inbox-header-buttons';
import { usePendingJoin } from '@/features/group-link/use-pending-join';

/** Deep links (group link → Conversation) keep the inbox underneath, so "back" leads home. */
export const unstable_settings = { anchor: 'index' };

/**
 * The signed-in app: one native stack, no tabs (ADR-0017). The inbox is home;
 * Activity and Profile are pushed from its header; creating things happens in
 * sheets/modals declared here.
 */
export default function AppLayout() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  usePendingJoin();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: 'split-pay', headerRight: () => <InboxHeaderButtons /> }} />
      <Stack.Screen name="activity" options={{ title: t`Aktywność` }} />
      <Stack.Screen name="profile" options={{ title: t`Profil` }} />
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
          sheetAllowedDetents: [0.6, 1],
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
  );
}
