import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import { type BalanceRow, drawerRows, type TransferRow } from '@/features/balances/balances';
import { balancesQuery, type GroupBalances } from '@/features/balances/balances-query';
import { myMemberId } from '@/features/entries/conversation';
import { type GroupDetail, groupQuery } from '@/features/groups/groups-query';
import { useFormatters } from '@/i18n/use-formatters';
import { authClient } from '@/lib/auth-client';

/**
 * Balance drawer (sheet from the balance banner): every member's balance and
 * who should pay whom — simplified or pairwise per the group's setting
 * (toggled in Group info → settings). "Oddaj" on my own transfer opens the
 * settle sheet with the recipient's payout details and the suggested amount;
 * "Inna spłata" at the bottom opens it with from / to / amount pickers.
 */
export default function BalancesSheet() {
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useQuery(groupQuery(groupId));
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
  const rows = drawerRows(balances, group.members, me);
  const archived = group.archivedAt !== null;

  const pay = (transfer: TransferRow) =>
    router.push({
      pathname: '/groups/[groupId]/settle',
      params: { groupId: group.id, to: transfer.to, amount: String(transfer.amount) },
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t`Salda`}</Text>
      <View style={styles.list}>
        {rows.balances.map((row) => (
          <BalanceItem key={row.memberId} row={row} currency={balances.baseCurrency} />
        ))}
      </View>

      <View style={styles.heading}>
        <Text style={styles.title}>{t`Kto komu oddaje`}</Text>
        <Text style={styles.muted}>
          {balances.simplifyDebts ? t`Uproszczone długi` : t`Bez upraszczania długów`}
        </Text>
      </View>
      {rows.transfers.length === 0 ? (
        <Text style={styles.muted}>{t`Wszyscy są rozliczeni.`}</Text>
      ) : (
        <View style={styles.list}>
          {rows.transfers.map((transfer) => (
            <TransferItem
              key={transfer.key}
              transfer={transfer}
              currency={balances.baseCurrency}
              // Archived group: no "Oddaj" (SPEC).
              onPay={transfer.direction === 'fromMe' && !archived ? () => pay(transfer) : undefined}
            />
          ))}
        </View>
      )}
      {/* TODO(#24): "Przypomnij" (nudge) on `toMe` transfers comes with push notifications. */}
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

function BalanceItem({ row, currency }: { row: BalanceRow; currency: string }) {
  const { t } = useLingui();
  const format = useFormatters();
  const amount = format.amount(Math.abs(row.amount), currency);
  const name = row.isMe ? t`${row.name} (Ty)` : row.name;
  const label =
    row.amount > 0 ? t`${name}: należy się ${amount}` : row.amount < 0 ? t`${name}: winien ${amount}` : t`${name}: rozliczony`;
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <Text style={[styles.name, row.isMe && styles.bold]}>{name}</Text>
      <Text style={[styles.amount, row.amount > 0 && styles.positive, row.amount < 0 && styles.negative]}>
        {row.amount > 0 ? `+${amount}` : row.amount < 0 ? `−${amount}` : amount}
      </Text>
    </View>
  );
}

function TransferItem({
  transfer,
  currency,
  onPay,
}: {
  transfer: TransferRow;
  currency: string;
  onPay: (() => void) | undefined;
}) {
  const { t } = useLingui();
  const format = useFormatters();
  const amount = format.amount(transfer.amount, currency);
  const from = transfer.direction === 'fromMe' ? t`Ty` : transfer.fromName;
  const to = transfer.direction === 'toMe' ? t`Tobie` : transfer.toName;
  const label = t`${from} → ${to}: ${amount}`;
  return (
    <View style={styles.row}>
      <View style={styles.transfer} accessible accessibilityLabel={label}>
        <Text style={[styles.name, transfer.direction !== 'others' && styles.bold]}>
          {from} → {to}
        </Text>
        <Text style={styles.amount}>{amount}</Text>
      </View>
      {onPay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t`Oddaj ${amount} – ${transfer.toName}`}
          onPress={onPay}
          style={({ pressed }) => [styles.pay, pressed && styles.pressed]}>
          <Text style={styles.payLabel}>{t`Oddaj`}</Text>
        </Pressable>
      ) : null}
    </View>
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
  heading: {
    gap: theme.space(1),
    marginTop: theme.space(3),
  },
  title: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  list: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.space(4),
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space(2),
    minHeight: 48,
    paddingVertical: theme.space(2),
  },
  transfer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space(2),
  },
  name: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  bold: {
    fontWeight: theme.font.weightBold,
  },
  amount: {
    marginStart: 'auto',
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  positive: {
    color: theme.colors.positive,
  },
  negative: {
    color: theme.colors.negative,
  },
  pay: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  payLabel: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.onPrimary,
  },
  pressed: {
    opacity: 0.6,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
