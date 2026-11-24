import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { StatsView } from '@/features/stats/stats-view';
import { PublicError } from '@/features/web-view/public-error';
import { usePublicGroup, publicStatsQuery } from '@/features/web-view/public-view-query';

/** Stats of the view-only web: the same table and categories as Group info → Stats in the app. */
export default function PublicStatsScreen() {
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const group = usePublicGroup(token);
  const stats = useQuery(publicStatsQuery(token));

  if (group.isError || stats.isError) {
    return (
      <PublicError
        error={group.error ?? stats.error}
        onRetry={() => void Promise.all([group.refetch(), stats.refetch()])}
      />
    );
  }
  if (group.isPending || stats.isPending) {
    return <ActivityIndicator style={styles.container} color={theme.colors.primary} />;
  }
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatsView stats={stats.data} members={group.data.members} />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.space(4),
    paddingBottom: theme.space(10),
  },
}));
