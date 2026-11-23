import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { GroupDetail } from '@/features/groups/groups-query';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { ChangeRow } from './change-row';
import { historyQuery } from './history-query';

const RECENT = 3;

/** Group info → change history: the latest changes (with "Cofnij") and a link to the whole history. */
export function HistorySection({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const history = useQuery(historyQuery(group.id));
  useRefreshOnFocus(history.refetch);

  if (history.isPending) return <ActivityIndicator color={theme.colors.primary} />;
  if (history.isError) return <Text style={styles.muted}>{t`Nie udało się wczytać historii.`}</Text>;
  return (
    <>
      {history.data.slice(0, RECENT).map((change) => (
        <ChangeRow key={change.id} group={group} change={change} />
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/groups/[groupId]/history', params: { groupId: group.id } })}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text style={styles.linkLabel}>{t`Pokaż całą historię`}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  link: {
    justifyContent: 'center',
    minHeight: 44,
  },
  linkLabel: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
