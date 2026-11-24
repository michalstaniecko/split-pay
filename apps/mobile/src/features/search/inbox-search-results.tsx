import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { useFormatters } from '@/i18n/use-formatters';
import type { EntrySearchHit } from './inbox-search';
import { inboxSearchQuery } from './inbox-search-query';

/**
 * The inbox while a search is typed: matching groups, then matching entries.
 * A group opens its Conversation; an entry opens it scrolled to the bubble,
 * highlighted (`?entryId=`, the same as opening a notification).
 */
export function InboxSearchResults({ query }: { query: string }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const results = useQuery(inboxSearchQuery(query));

  if (results.isPending) return <ActivityIndicator style={styles.center} color={theme.colors.primary} />;
  if (results.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t`Nie udało się wyszukać.`}</Text>
      </View>
    );
  }
  const { groups, entries } = results.data;
  if (groups.length === 0 && entries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t`Brak wyników`}</Text>
      </View>
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
      {groups.length > 0 ? (
        <Section title={t`Grupy`}>
          {groups.map((group) => (
            <ResultRow
              key={group.id}
              emoji={group.emoji}
              color={group.color}
              title={group.name}
              onPress={() => router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } })}
            />
          ))}
        </Section>
      ) : null}
      {entries.length > 0 ? (
        <Section title={t`Wpisy`}>
          {entries.map((hit) => (
            <EntryResultRow key={hit.entryId} hit={hit} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function EntryResultRow({ hit }: { hit: EntrySearchHit }) {
  const format = useFormatters();
  return (
    <ResultRow
      emoji={hit.group.emoji}
      color={hit.group.color}
      title={hit.title}
      detail={`${hit.group.name} · ${format.date(hit.date)} · ${format.amount(hit.amount, hit.currency)}`}
      onPress={() =>
        router.push({ pathname: '/groups/[groupId]', params: { groupId: hit.groupId, entryId: hit.entryId } })
      }
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ResultRow(props: { emoji: string; color: string; title: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <GroupAvatar emoji={props.emoji} color={props.color} size={36} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {props.title}
        </Text>
        {props.detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {props.detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(6),
  },
  list: {
    paddingBottom: theme.space(24),
  },
  sectionTitle: {
    paddingTop: theme.space(4),
    paddingBottom: theme.space(1),
    paddingHorizontal: theme.space(4),
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    minHeight: 44,
    paddingVertical: theme.space(2),
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
  detail: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
}));
