import { Tabs } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';

export default function TabsLayout() {
  const { theme } = useUnistyles();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
      }}>
      {/* TODO: i18n — Polish UI copy hardcoded for now */}
      <Tabs.Screen name="index" options={{ title: 'Grupy' }} />
      <Tabs.Screen name="activity" options={{ title: 'Aktywność' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
