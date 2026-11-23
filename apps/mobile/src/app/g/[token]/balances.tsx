import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { type BalanceRow, drawerRows, type TransferRow } from '@/features/balances/balances';
import { PublicError } from '@/features/web-view/public-error';
import {
  type PublicBalances,
  type PublicGroup,
  publicBalancesQuery,
  publicGroupQuery,
} from '@/features/web-view/public-view-query';
import { useThisIsMe } from '@/features/web-view/this-is-me';
import { useFormatters } from '@/i18n/use-formatters';

/**
 * The balance drawer of the view-only web: every member's balance and who
 * pays whom, read-only — no "Oddaj", "Przypomnij" or "Inna spłata" (SPEC).
 */
export default function PublicBalancesScreen() {
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const group = useQuery(publicGroupQuery(token));
  const balances = useQuery(publicBalancesQuery(token));

  if (group.isError) return <PublicError error={group.error} onRetry={() => void group.refetch()} />;
  if (balances.isError) return <PublicError error={balances.error} onRetry={() => void balances.refetch()} />;
  if (!group.data || !balances.data) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  return <Drawer data={group.data} balances={balances.data} />;
}

function Drawer({ data, balances }: { data: PublicGroup; balances: PublicBalances }) {
  const { t } = useLingui();
  const { me } = useThisIsMe(data);
  const rows = drawerRows(balances, data.members, me);

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
            <TransferItem key={transfer.key} transfer={transfer} currency={balances.baseCurrency} />
          ))}
        </View>
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

function TransferItem({ transfer, currency }: { transfer: TransferRow; currency: string }) {
  const { t } = useLingui();
  const format = useFormatters();
  const amount = format.amount(transfer.amount, currency);
  const from = transfer.direction === 'fromMe' ? t`Ty` : transfer.fromName;
  const to = transfer.direction === 'toMe' ? t`Tobie` : transfer.toName;
  return (
    <View style={styles.row} accessible accessibilityLabel={t`${from} → ${to}: ${amount}`}>
      <Text style={[styles.name, transfer.direction !== 'others' && styles.bold]}>
        {from} → {to}
      </Text>
      <Text style={styles.amount}>{amount}</Text>
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
    justifyContent: 'space-between',
    columnGap: theme.space(2),
    minHeight: 48,
    paddingVertical: theme.space(2),
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
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
