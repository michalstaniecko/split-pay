import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { GroupNotFound } from '@/components/group-not-found';
import { ClaimMessages } from '@/features/claims/claim-messages';
import { groupQuery } from '@/features/groups/groups-query';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/**
 * Group screen = the Conversation (ADR-0017). The header (emoji + name) and
 * `⋯` open Group info. Entries, balance banner and composer come in #8/#9.
 */
export default function ConversationScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useQuery(groupQuery(groupId));
  useRefreshOnFocus(group.refetch);

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
        <>
          {/* Claim system messages (#18). */}
          <ClaimMessages groupId={groupId} />
          {/* TODO(#8): entries as bubbles (FlashList), composer at the bottom; TODO(#9): balance banner. */}
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>{t`Brak wpisów`}</Text>
            <Text style={styles.muted}>{t`Wydatki dodane w tej grupie pojawią się tutaj.`}</Text>
          </View>
        </>
      )}
    </View>
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
}));
