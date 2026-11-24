import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import type { TransferRow } from '@/features/balances/balances';
import { balancesQuery, type GroupBalances } from '@/features/balances/balances-query';
import { BalancesView } from '@/features/balances/balances-view';
import { myMemberId } from '@/features/entries/conversation';
import { type GroupDetail, useGroup } from '@/features/groups/groups-query';
import { NudgeButton } from '@/features/notifications/nudge-button';
import { authClient } from '@/lib/auth-client';

/**
 * Balance drawer (sheet from the balance banner): every member's balance and
 * who should pay whom — simplified or pairwise per the group's setting
 * (toggled in Group info → settings). "Oddaj" on my own transfer opens the
 * settle sheet with the recipient's payout details and the suggested amount;
 * "Przypomnij" on a transfer owed to me nudges the debtor by push (#24);
 * "Inna spłata" at the bottom opens it with from / to / amount pickers.
 */
export default function BalancesSheet() {
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useGroup(groupId);
  const balances = useQuery(balancesQuery(groupId));

  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  if (balances.isError) return <GroupNotFound error={balances.error} onRetry={() => void balances.refetch()} />;
  if (!group.data || !balances.data) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  return <Drawer group={group.data} balances={balances.data} />;
}

function Drawer({ group, balances }: { group: GroupDetail; balances: GroupBalances }) {
  const { t } = useLingui();
  const { data: session } = authClient.useSession();
  const me = myMemberId(group.members, session?.user.id);
  const archived = group.archivedAt !== null;

  const pay = (transfer: TransferRow) =>
    router.push({
      pathname: '/groups/[groupId]/settle',
      params: { groupId: group.id, to: transfer.to, amount: String(transfer.amount) },
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BalancesView
        balances={balances}
        members={group.members}
        me={me}
        // Archived group: no "Oddaj" (SPEC).
        payAction={(transfer) => (transfer.direction === 'fromMe' && !archived ? () => pay(transfer) : undefined)}
        nudge={(transfer) => <NudgeButton group={group} transfer={transfer} />}
      />
      {archived ? null : (
        <Button
          variant="secondary"
          label={t`Inna spłata`}
          onPress={() => router.push({ pathname: '/groups/[groupId]/settle', params: { groupId: group.id } })}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    padding: theme.space(6),
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingBottom: theme.space(10),
  },
}));
