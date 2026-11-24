import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupAvatar } from '@/components/group-avatar';
import { inboxSections } from '@/features/groups/group-lifecycle';
import { type GroupListItem, groupsQuery } from '@/features/groups/groups-query';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { InboxSearchField } from '@/features/search/inbox-search-field';
import { InboxSearchResults } from '@/features/search/inbox-search-results';
import { useFormatters } from '@/i18n/use-formatters';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** Inbox (home): my groups, most recent activity first (ADR-0017). */
export default function InboxScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const groups = useQuery(groupsQuery());
  useRefreshOnFocus(groups.refetch);
  const [query, setQuery] = useState('');

  const openNew = () => router.push('/new');

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <InboxSearchField value={query} onChange={setQuery} />
      {query.trim() !== '' ? (
        <InboxSearchResults query={query} />
      ) : groups.isPending ? (
        <ActivityIndicator style={styles.center} color={theme.colors.primary} />
      ) : groups.isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t`Nie udało się wczytać grup.`}</Text>
          <Button variant="secondary" label={t`Spróbuj ponownie`} onPress={() => void groups.refetch()} />
        </View>
      ) : (
        <FlatList
          data={inboxSections(groups.data).active}
          keyExtractor={(group) => group.id}
          renderItem={({ item }) => <InboxRow group={item} />}
          contentContainerStyle={groups.data.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            groups.data.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t`Nie masz jeszcze grup`}</Text>
                <Text style={styles.muted}>{t`Utwórz grupę dla wyjazdu, mieszkania albo jednego rachunku.`}</Text>
              </View>
            ) : undefined
          }
          ListFooterComponent={<ArchivedSection groups={inboxSections(groups.data).archived} />}
          refreshControl={
            <RefreshControl
              refreshing={groups.isRefetching}
              onRefresh={() => void groups.refetch()}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
      <Pressable
        accessibilityRole="button"
        onPress={openNew}
        style={({ pressed }) => [styles.newButton, { bottom: insets.bottom + theme.space(4) }, pressed && styles.pressed]}>
        <Text style={styles.newLabel}>{t`Nowy`}</Text>
      </Pressable>
    </View>
  );
}

/** Archived groups at the bottom of the inbox, collapsed until tapped (SPEC "Inbox"). */
function ArchivedSection({ groups }: { groups: GroupListItem[] }) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  if (groups.length === 0) return null;
  const count = groups.length;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((e) => !e)}
        style={({ pressed }) => [styles.archivedHeader, pressed && styles.pressed]}>
        <Text style={styles.archivedTitle}>{t`Zarchiwizowane`}</Text>
        <Text style={styles.preview}>
          {count} {expanded ? '▾' : '▸'}
        </Text>
      </Pressable>
      {expanded ? groups.map((group) => <InboxRow key={group.id} group={group} />) : null}
    </View>
  );
}

function InboxRow({ group }: { group: GroupListItem }) {
  const { t } = useLingui();
  const format = useFormatters();
  const dates =
    group.startDate && group.endDate ? `${format.date(group.startDate)} – ${format.date(group.endDate)}` : null;
  // The most recently added entry (API `lastEntry`); unread state comes later.
  const last = group.lastEntry;
  const preview = last
    ? `${last.title ?? t`Spłata`} · ${format.amount(last.amount, last.currency)}`
    : (dates ?? t`Brak wpisów`);
  return (
    <Link href={{ pathname: '/groups/[groupId]', params: { groupId: group.id } }} asChild>
      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <GroupAvatar emoji={group.emoji} color={group.color} />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
      </Pressable>
    </Link>
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
  },
  list: {
    paddingBottom: theme.space(24),
  },
  emptyContainer: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    padding: theme.space(6),
  },
  emptyTitle: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(4),
  },
  rowText: {
    flex: 1,
    gap: theme.space(1),
  },
  name: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  preview: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  pressed: {
    opacity: 0.6,
  },
  archivedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginTop: theme.space(4),
    paddingHorizontal: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  archivedTitle: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  newButton: {
    position: 'absolute',
    end: theme.space(4),
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(6),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  newLabel: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.onPrimary,
  },
}));
