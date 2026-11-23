import { useLingui } from '@lingui/react/macro';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { Entry } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { GroupNotFound } from '@/components/group-not-found';
import { BalanceBanner } from '@/features/balances/balance-banner';
import { ClaimMessage } from '@/features/claims/claim-messages';
import { type Claim, claimsQuery } from '@/features/claims/claims-query';
import { useBubbleMenu } from '@/features/entries/bubble-menu';
import { Composer } from '@/features/entries/composer';
import {
  type ConversationItem,
  conversationItems,
  myMemberId as findMyMemberId,
  newestAddedEntry,
} from '@/features/entries/conversation';
import { entriesQuery } from '@/features/entries/entries-query';
import { DaySeparator, EntryBubble } from '@/features/entries/entry-bubble';
import { type GroupDetail, groupQuery } from '@/features/groups/groups-query';
import { authClient } from '@/lib/auth-client';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** How long a just-added entry stays highlighted. */
const HIGHLIGHT_MS = 2000;

/**
 * Group screen = the Conversation (ADR-0017): entries as bubbles from their
 * payers by entry date, sticky day separators with the daily total, the
 * composer at the bottom, the balance banner on top. The header (emoji +
 * name) and `⋯` open Group info.
 */
export default function ConversationScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useQuery(groupQuery(groupId));
  const entries = useQuery(entriesQuery(groupId));
  const claims = useQuery(claimsQuery(groupId));
  useRefreshOnFocus(group.refetch);
  useRefreshOnFocus(entries.refetch);
  useRefreshOnFocus(claims.refetch);
  const insets = useSafeAreaInsets();
  const session = authClient.useSession();
  const me = group.data ? findMyMemberId(group.data.members, session.data?.user.id) : null;

  const openInfo = () => router.push({ pathname: '/groups/[groupId]/info', params: { groupId } });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: () =>
            group.data ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t`${group.data.name}, informacje o grupie`}
                onPress={openInfo}
                style={styles.title}>
                <GroupAvatar emoji={group.data.emoji} color={group.data.color} size={32} />
                <Text style={styles.titleText} numberOfLines={1}>
                  {group.data.name}
                </Text>
              </Pressable>
            ) : null,
          headerRight: () =>
            group.data ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t`Informacje o grupie`}
                hitSlop={8}
                onPress={openInfo}
                style={styles.more}>
                <Text style={styles.moreText}>⋯</Text>
              </Pressable>
            ) : null,
        }}
      />
      {group.isPending ? (
        <ActivityIndicator style={styles.center} color={theme.colors.primary} />
      ) : group.isError ? (
        <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />
      ) : (
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
          <BalanceBanner groupId={groupId} myMemberId={me} />
          {entries.isPending ? (
            <ActivityIndicator style={styles.center} color={theme.colors.primary} />
          ) : entries.isError ? (
            <View style={styles.center}>
              <Text style={styles.muted}>{t`Nie udało się wczytać wpisów.`}</Text>
              <Pressable accessibilityRole="button" onPress={() => void entries.refetch()}>
                <Text style={styles.link}>{t`Spróbuj ponownie`}</Text>
              </Pressable>
            </View>
          ) : (
            <Conversation group={group.data} entries={entries.data} claims={claims.data ?? []} me={me} />
          )}
          {group.data.archivedAt === null ? (
            <Composer
              group={group.data}
              members={group.data.members}
              myMemberId={me}
              onOpenForm={() => router.push({ pathname: '/groups/[groupId]/expense-form', params: { groupId } })}
            />
          ) : (
            // Archived group: read-only (SPEC "Conversation").
            <View style={[styles.archivedBar, { paddingBottom: insets.bottom + theme.space(3) }]} accessibilityRole="text">
              <Text style={styles.archivedText}>{t`Grupa zarchiwizowana`}</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function Conversation({
  group,
  entries,
  claims,
  me,
}: {
  group: GroupDetail;
  entries: Entry[];
  claims: Claim[];
  me: string | null;
}) {
  const { t } = useLingui();
  const { items, stickyHeaderIndices } = useMemo(
    () => conversationItems(entries, { members: group.members, myMemberId: me, baseCurrency: group.baseCurrency, claims }),
    [entries, group.members, me, group.baseCurrency, claims],
  );
  const listRef = useRef<FlashListRef<ConversationItem<Claim>>>(null);
  const highlightId = useNewEntryHighlight(items, listRef);
  const openMenu = useBubbleMenu(group);

  const openEntry = (entryId: string) =>
    router.push({ pathname: '/groups/[groupId]/entries/[entryId]', params: { groupId: group.id, entryId } });

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t`Brak wpisów`}</Text>
        <Text style={styles.muted}>{t`Wpisz kwotę i tytuł poniżej, żeby dodać pierwszy wydatek.`}</Text>
      </View>
    );
  }

  return (
    <FlashList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.type}
      stickyHeaderIndices={stickyHeaderIndices}
      extraData={highlightId}
      // Opens at the newest entry; keeps following new ones while the user is near the bottom.
      maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
      initialScrollIndex={items.length - 1}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      renderItem={({ item }) =>
        item.type === 'day' ? (
          <DaySeparator item={item} baseCurrency={group.baseCurrency} />
        ) : item.type === 'claim' ? (
          <ClaimMessage groupId={group.id} claim={item.claim} />
        ) : (
          <EntryBubble
            item={item}
            baseCurrency={group.baseCurrency}
            highlighted={item.entry.id === highlightId}
            onPress={() => openEntry(item.entry.id)}
            onLongPress={() => openMenu(item.entry)}
          />
        )
      }
    />
  );
}

/**
 * Scrolls to an entry that just appeared (e.g. a backdated one landing above
 * the viewport) and highlights it briefly. Returns the highlighted entry id.
 */
function useNewEntryHighlight(
  items: ConversationItem<Claim>[],
  listRef: React.RefObject<FlashListRef<ConversationItem<Claim>> | null>,
): string | null {
  const known = useRef<Set<string> | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const added = newestAddedEntry(known.current, items);
    known.current = new Set(items.flatMap((i) => (i.type === 'entry' ? [i.entry.id] : [])));
    if (!added) return;
    void listRef.current?.scrollToIndex({ index: added.index, animated: true, viewPosition: 0.5 });
    setHighlightId(added.id);
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [items, listRef]);

  return highlightId;
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
    gap: theme.space(2),
    padding: theme.space(6),
  },
  list: {
    paddingVertical: theme.space(2),
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    maxWidth: 240,
  },
  titleText: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  more: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: theme.font.sizeXl,
    color: theme.colors.text,
  },
  emptyTitle: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  link: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
  },
  archivedBar: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: theme.space(4),
    paddingTop: theme.space(3),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  archivedText: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
}));
