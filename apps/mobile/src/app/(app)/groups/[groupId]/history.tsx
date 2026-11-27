import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupNotFound } from '@/components/group-not-found';
import { useGroup } from '@/features/groups/groups-query';
import { ChangeRow } from '@/features/history/change-row';
import { historyQuery } from '@/features/history/history-query';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/**
 * Change history (#20): every change in the group, newest first, with
 * "Cofnij". `?entryId=` shows one entry's history (long-press "Historia" on
 * a bubble, "edytowano" in the entry detail).
 */
export default function HistoryScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId?: string }>();
  const group = useGroup(groupId);
  const history = useQuery(historyQuery(groupId, entryId));
  const pull = usePullToRefresh(history.refetch);
  useRefreshOnFocus(history.refetch);
  const title = entryId ? t`Historia wpisu` : t`Historia zmian`;

  if (group.isError || history.isError) {
    return (
      <GroupNotFound
        error={group.error ?? history.error}
        onRetry={() => void Promise.all([group.refetch(), history.refetch()])}
      />
    );
  }
  if (group.isPending || history.isPending) {
    return <ActivityIndicator style={styles.container} color={theme.colors.primary} />;
  }
  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={history.data}
        keyExtractor={(change) => change.id}
        renderItem={({ item }) => <ChangeRow group={group.data} change={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        ListEmptyComponent={<Text style={styles.empty}>{t`Brak zmian.`}</Text>}
      />
    </>
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
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  empty: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
}));
