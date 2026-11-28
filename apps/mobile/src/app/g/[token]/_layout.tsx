import { useLingui } from '@lingui/react/macro';
import { Stack } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';

/** A page opened directly (e.g. a shared entry URL) keeps the group preview below it. */
export const unstable_settings = { anchor: 'index' };

/**
 * A group link (`/g/<token>`), outside the signed-in group so it opens without
 * an account. Web: the group preview (SPEC "Web interface"), Stats and the
 * entry detail.
 * Native: the join screen (`index.tsx`). On the web, sheets are plain pages.
 */
export default function GroupLinkLayout() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="stats" options={{ title: t`Statystyki` }} />
      <Stack.Screen name="entries/[entryId]" options={{ title: t`Wpis` }} />
    </Stack>
  );
}
