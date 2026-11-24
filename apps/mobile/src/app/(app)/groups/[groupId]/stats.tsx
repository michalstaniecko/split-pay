import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupNotFound } from '@/components/group-not-found';
import { useGroup } from '@/features/groups/groups-query';
import { statsQuery } from '@/features/stats/stats-query';
import { StatsView } from '@/features/stats/stats-view';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** Group info → Stats: days × people table and the breakdown by category, in the base currency. */
export default function StatsScreen() {
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useGroup(groupId);
  const stats = useQuery(statsQuery(groupId));
  useRefreshOnFocus(stats.refetch);

  if (group.isError || stats.isError) {
    return (
      <GroupNotFound
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
