import { useLingui } from '@lingui/react/macro';
import { Tabs } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';

export default function TabsLayout() {
  const { theme } = useUnistyles();
  const { t } = useLingui();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
      }}>
      <Tabs.Screen name="index" options={{ title: t`Grupy` }} />
      <Tabs.Screen name="activity" options={{ title: t`Aktywność` }} />
      <Tabs.Screen name="profile" options={{ title: t`Profil` }} />
    </Tabs>
  );
}
