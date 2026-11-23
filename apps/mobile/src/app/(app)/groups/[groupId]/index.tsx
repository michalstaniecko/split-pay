import { useLingui } from '@lingui/react/macro';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { Entry } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { GroupNotFound } from '@/components/group-not-found';
import { BalanceBanner } from '@/features/balances/balance-banner';
import { ClaimMessage } from '@/features/claims/claim-messages';
import { type Claim, claimsQuery } from '@/features/claims/claims-query';
import { Composer } from '@/features/entries/composer';
import {
  type ConversationItem,
  conversationItems,
  myMemberId as findMyMemberId,
  newestAddedEntry,
} from '@/features/entries/conversation';
import { entriesQuery, useDeleteEntry, useRestoreEntry } from '@/features/entries/entries-query';
import { EntryActionsMenu } from '@/features/entries/entry-actions-menu';
import { DaySeparator, EntryBubble } from '@/features/entries/entry-bubble';
import { useEntryConflicts } from '@/features/entries/entry-conflicts';
import { amountForClipboard, type EntryAction, entryActions, versionConflictEntry } from '@/features/entries/entry-edit';
import { UndoSnackbar } from '@/features/entries/undo-snackbar';
import { type GroupDetail, groupQuery } from '@/features/groups/groups-query';
import { useFocusedEntry } from '@/features/notifications/use-focused-entry';
import { SettlementSystemMessage } from '@/features/settlements/settlement-system-message';
import { useLocale } from '@/i18n/locale-provider';
import { authClient } from '@/lib/auth-client';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** How long a just-added entry stays highlighted. */
const HIGHLIGHT_MS = 2000;

/**
 * Group screen = the Conversation (ADR-0017): entries as bubbles from their
 * payers by entry date, sticky day separators with the daily total, the
 * composer at the bottom, the balance banner on top. The header (emoji +
 * name) and `⋯` open Group info.
 * Long-press on a bubble: Edytuj, Usuń (with a "Cofnij" snackbar), Historia,
 * Kopiuj kwotę (#11).
 */
export default function ConversationScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  // `entryId`: opened from a notification — scroll to that bubble and highlight it.
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId?: string }>();
  const group = useQuery(groupQuery(groupId));
  const entries = useQuery(entriesQuery(groupId));
  const claims = useQuery(claimsQuery(groupId));
  useRefreshOnFocus(group.refetch);
  useRefreshOnFocus(entries.refetch);
  useRefreshOnFocus(claims.refetch);
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
            <Conversation
              group={group.data}
              entries={entries.data}
              claims={claims.data ?? []}
              me={me}
              focusEntryId={entryId}
            />
          )}
          {group.data.archivedAt === null ? (
            <Composer
              group={group.data}
              members={group.data.members}
              myMemberId={me}
              onOpenForm={() => router.push({ pathname: '/groups/[groupId]/expense-form', params: { groupId } })}
            />
          ) : null}
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
  focusEntryId,
}: {
  group: GroupDetail;
  entries: Entry[];
  claims: Claim[];
  me: string | null;
  focusEntryId: string | undefined;
}) {
  const { t } = useLingui();
  const { items, stickyHeaderIndices } = useMemo(
    () => conversationItems(entries, { members: group.members, myMemberId: me, baseCurrency: group.baseCurrency, claims }),
    [entries, group.members, me, group.baseCurrency, claims],
  );
  const listRef = useRef<FlashListRef<ConversationItem<Claim>>>(null);
  const newHighlightId = useNewEntryHighlight(items, listRef);
  const focusedId = useFocusedEntry(items, listRef, focusEntryId);
  const highlightId = focusedId ?? newHighlightId;

  const actions = useEntryActionHandler(group);
  const conflicts = useEntryConflicts(group.id);

  const openEntry = (entryId: string) =>
    router.push({ pathname: '/groups/[groupId]/entries/[entryId]', params: { groupId: group.id, entryId } });
  const openConflict = (entryId: string) =>
    router.push({ pathname: '/groups/[groupId]/entry-conflict', params: { groupId: group.id, entryId } });

  return (
    <View style={styles.container}>
      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t`Brak wpisów`}</Text>
          <Text style={styles.muted}>{t`Wpisz kwotę i tytuł poniżej, żeby dodać pierwszy wydatek.`}</Text>
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => (item.type === 'entry' && item.entry.kind === 'settlement' ? 'settlement' : item.type)}
          stickyHeaderIndices={stickyHeaderIndices}
          extraData={[highlightId, conflicts]}
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
            ) : item.entry.kind === 'settlement' ? (
              // Settlements are system messages, not bubbles (ADR-0017).
              <SettlementSystemMessage
                entry={item.entry}
                members={group.members}
                myMemberId={me}
                highlighted={item.entry.id === highlightId}
                onPress={() => openEntry(item.entry.id)}
              />
            ) : (
              <EntryBubble
                item={item}
                baseCurrency={group.baseCurrency}
                highlighted={item.entry.id === highlightId}
                onPress={() => openEntry(item.entry.id)}
                onLongPress={() => actions.openMenu(item.entry)}
                actions={entryActions(item.entry, group)}
                onAction={(action) => actions.run(item.entry, action)}
                conflict={conflicts.has(item.entry.id)}
                onConflictPress={() => openConflict(item.entry.id)}
              />
            )
          }
        />
      )}
      {actions.elements}
    </View>
  );
}

/**
 * The bubbles' long-press menu and what its actions do: "Edytuj" opens the
 * full form for the entry, "Usuń" soft-deletes it and offers "Cofnij" in a
 * snackbar, "Kopiuj kwotę" copies the bare amount. `elements` (menu +
 * snackbar) go below the list. TODO(#20): "Historia" opens the entry's change history.
 */
function useEntryActionHandler(group: GroupDetail) {
  const { t } = useLingui();
  const { locale } = useLocale();
  const [menuEntry, setMenuEntry] = useState<Entry | null>(null);
  const [undo, setUndo] = useState<Entry | null>(null);
  const deleteEntry = useDeleteEntry(group.id);
  const restoreEntry = useRestoreEntry(group.id);
  const hideUndo = useCallback(() => setUndo(null), []);

  const run = (entry: Entry, action: EntryAction) => {
    switch (action) {
      case 'edit':
        router.push({ pathname: '/groups/[groupId]/expense-form', params: { groupId: group.id, entryId: entry.id } });
        return;
      case 'delete':
        setUndo(null);
        deleteEntry.mutate(entry, {
          onSuccess: (deleted) => setUndo(deleted),
          onError: (error) => {
            // A version conflict marks the bubble with "!" instead.
            if (!versionConflictEntry(error)) Alert.alert(t`Nie udało się usunąć wpisu. Spróbuj ponownie.`);
          },
        });
        return;
      case 'history':
        return; // TODO(#20)
      case 'copyAmount':
        void Clipboard.setStringAsync(amountForClipboard(entry.amount, entry.currency, locale)).then(() =>
          AccessibilityInfo.announceForAccessibility(t`Skopiowano kwotę`),
        );
        return;
    }
  };

  const titleOf = (entry: Entry) => (entry.kind === 'settlement' ? t`Spłata` : entry.title);
  const elements = (
    <>
      {undo ? (
        <UndoSnackbar
          message={t`Usunięto: ${titleOf(undo)}`}
          busy={restoreEntry.isPending}
          onHide={hideUndo}
          onUndo={() =>
            restoreEntry.mutate(undo, {
              onSuccess: hideUndo,
              onError: () => Alert.alert(t`Nie udało się przywrócić wpisu.`),
            })
          }
        />
      ) : null}
      <EntryActionsMenu
        title={menuEntry ? titleOf(menuEntry) : null}
        actions={menuEntry ? entryActions(menuEntry, group) : []}
        disabled={['history']}
        onClose={() => setMenuEntry(null)}
        onSelect={(action) => menuEntry && run(menuEntry, action)}
      />
    </>
  );

  return { openMenu: setMenuEntry, run, elements };
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
}));
