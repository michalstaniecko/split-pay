import { useLingui } from '@lingui/react/macro';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { BalanceBannerView } from '@/features/balances/balance-banner';
import { conversationItems } from '@/features/entries/conversation';
import { DaySeparator, EntryBubble } from '@/features/entries/entry-bubble';
import { SettlementSystemMessage } from '@/features/settlements/settlement-system-message';
import { ClaimBanner } from '@/features/web-view/claim-banner';
import { PublicError } from '@/features/web-view/public-error';
import {
  type PublicEntry,
  type PublicGroup,
  publicBalancesQuery,
  publicEntriesQuery,
  publicGroupQuery,
} from '@/features/web-view/public-view-query';
import { useThisIsMe } from '@/features/web-view/this-is-me';
import { WebFooter } from '@/features/web-view/web-footer';
import { claimBannerMember } from '@/features/web-view/web-view';

/**
 * The view-only web Conversation for a group link (SPEC "Web interface"):
 * the same layout as the app, read-only — balance banner, bubbles by entry
 * date, no composer and no long-press menu. "This is me" (remembered in the
 * browser) puts that member's bubbles on the end edge and drives the banner.
 * The header opens the limited Group info. A personal claim link adds a
 * banner naming its member, with "download the app". Native: `index.tsx` (join screen).
 */
export default function PublicConversationScreen() {
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const group = useQuery(publicGroupQuery(token));

  if (group.isPending) return <ActivityIndicator style={styles.center} color={theme.colors.primary} />;
  if (group.isError) return <PublicError error={group.error} onRetry={() => void group.refetch()} />;
  return <PublicConversation token={token} data={group.data} />;
}

function PublicConversation({ token, data }: { token: string; data: PublicGroup }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { group } = data;
  const entries = useQuery(publicEntriesQuery(token));
  const balances = useQuery(publicBalancesQuery(token));
  const { me } = useThisIsMe(data);
  const claimMember = claimBannerMember(data);
  const openInfo = () => router.push({ pathname: '/g/[token]/info', params: { token } });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: group.name,
          headerTitle: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t`${group.name}, informacje o grupie`}
              onPress={openInfo}
              style={styles.title}>
              <GroupAvatar emoji={group.emoji} color={group.color} size={32} />
              <Text style={styles.titleText} numberOfLines={1}>
                {group.name}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t`Informacje o grupie`}
              hitSlop={8}
              onPress={openInfo}
              style={styles.more}>
              <Text style={styles.moreText}>⋯</Text>
            </Pressable>
          ),
        }}
      />
      {claimMember ? <ClaimBanner displayName={claimMember.displayName} /> : null}
      {me === null ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/g/[token]/me', params: { token } })}
          style={({ pressed }) => [styles.choose, pressed && styles.pressed]}>
          <Text style={styles.chooseText}>{t`Kim jesteś? Wybierz siebie, żeby zobaczyć swoje saldo ›`}</Text>
        </Pressable>
      ) : balances.data ? (
        <BalanceBannerView
          balances={balances.data}
          myMemberId={me}
          onPress={() => router.push({ pathname: '/g/[token]/balances', params: { token } })}
        />
      ) : null}
      {entries.isPending ? (
        <ActivityIndicator style={styles.center} color={theme.colors.primary} />
      ) : entries.isError ? (
        <PublicError error={entries.error} onRetry={() => void entries.refetch()} />
      ) : (
        <EntryList token={token} data={data} entries={entries.data} me={me} />
      )}
      <WebFooter token={token} />
    </View>
  );
}

function EntryList({
  token,
  data,
  entries,
  me,
}: {
  token: string;
  data: PublicGroup;
  entries: PublicEntry[];
  me: string | null;
}) {
  const { t } = useLingui();
  const { baseCurrency } = data.group;
  const { items, stickyHeaderIndices } = useMemo(
    () => conversationItems(entries, { members: data.members, myMemberId: me, baseCurrency }),
    [entries, data.members, me, baseCurrency],
  );

  const openEntry = (entryId: string) =>
    router.push({ pathname: '/g/[token]/entries/[entryId]', params: { token, entryId } });

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t`Brak wpisów`}</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.type}
      stickyHeaderIndices={stickyHeaderIndices}
      maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
      initialScrollIndex={items.length - 1}
      contentContainerStyle={styles.list}
      renderItem={({ item }) =>
        item.type === 'day' ? (
          <DaySeparator item={item} baseCurrency={baseCurrency} />
        ) : item.type !== 'entry' ? null : item.entry.kind === 'settlement' ? (
          // Settlements are system messages, not bubbles (ADR-0017).
          <SettlementSystemMessage
            entry={item.entry}
            members={data.members}
            myMemberId={me}
            highlighted={false}
            onPress={() => openEntry(item.entry.id)}
          />
        ) : (
          <EntryBubble
            item={item}
            baseCurrency={baseCurrency}
            highlighted={false}
            onPress={() => openEntry(item.entry.id)}
          />
        )
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
  choose: {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chooseText: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
}));
