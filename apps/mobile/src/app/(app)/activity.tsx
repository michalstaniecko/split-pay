import { useLingui } from '@lingui/react/macro';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { flattenActivityPages } from '@/features/activity/activity';
import { activityQuery, activitySeen } from '@/features/activity/activity-query';
import { ActivityRow } from '@/features/activity/activity-row';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/**
 * Activity (#21, behind the inbox bell): changes from all my groups, newest
 * first, loaded page by page. Opening it stores the time on the device, which
 * clears the bell's unread dot.
 */
export default function ActivityScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const feed = useInfiniteQuery(activityQuery());
  const pull = usePullToRefresh(feed.refetch);
  useRefreshOnFocus(feed.refetch);
  const { items, memberNames } = useMemo(() => flattenActivityPages(feed.data?.pages ?? []), [feed.data]);

  useFocusEffect(
    useCallback(() => {
      activitySeen.markOpened(new Date().toISOString());
    }, []),
  );
  // The server's clock may be ahead of the device's: what's been shown counts as seen too.
  const newest = items[0]?.createdAt;
  useEffect(() => {
    if (newest) activitySeen.markOpened(newest);
  }, [newest]);

  if (feed.isPending) return <ActivityIndicator style={styles.center} color={theme.colors.primary} />;
  if (feed.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t`Nie udało się wczytać aktywności.`}</Text>
        <Button variant="secondary" label={t`Spróbuj ponownie`} onPress={() => void feed.refetch()} />
      </View>
    );
  }
  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ActivityRow item={item} memberNames={memberNames} />}
      contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.muted}>{t`Nic się jeszcze nie wydarzyło w Twoich grupach.`}</Text>
        </View>
      }
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        feed.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={theme.colors.primary} /> : undefined
      }
      refreshControl={
        <RefreshControl
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    padding: theme.space(6),
    backgroundColor: theme.colors.background,
  },
  list: {
    paddingVertical: theme.space(2),
  },
  emptyContainer: {
    flexGrow: 1,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: theme.space(4),
  },
}));
