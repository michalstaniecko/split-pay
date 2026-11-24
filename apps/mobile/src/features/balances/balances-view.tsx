import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useFormatters } from '@/i18n/use-formatters';
import { balanceRowLabel } from './balance-label';
import { type BalanceRow, drawerRows, type TransferRow } from './balances';

/**
 * The balance drawer's content: every member's balance and who pays whom
 * (simplified or pairwise per the group's setting). Data in, no fetching — the
 * signed-in drawer and the view-only web (#19) feed it from their own queries.
 * Read-only unless the caller passes `payAction` ("Oddaj") or `nudge`
 * ("Przypomnij"). Rendered as siblings, to sit in the caller's ScrollView.
 */
export function BalancesView({
  balances,
  members,
  me,
  payAction,
  nudge,
}: {
  balances: Parameters<typeof drawerRows>[0] & { baseCurrency: string; simplifyDebts: boolean };
  members: Parameters<typeof drawerRows>[1];
  me: string | null;
  /** "Oddaj" on a transfer, where it applies. */
  payAction?: (transfer: TransferRow) => (() => void) | undefined;
  /** "Przypomnij" on a transfer (renders nothing where it doesn't apply). */
  nudge?: (transfer: TransferRow) => ReactNode;
}) {
  const { t } = useLingui();
  const rows = drawerRows(balances, members, me);

  return (
    <>
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
        <Text style={styles.muted}>{t`Wszystko rozliczone.`}</Text>
      ) : (
        <View style={styles.list}>
          {rows.transfers.map((transfer) => (
            <TransferItem
              key={transfer.key}
              transfer={transfer}
              currency={balances.baseCurrency}
              onPay={payAction?.(transfer)}
              nudge={nudge?.(transfer)}
            />
          ))}
        </View>
      )}
    </>
  );
}

function BalanceItem({ row, currency }: { row: BalanceRow; currency: string }) {
  const { t } = useLingui();
  const format = useFormatters();
  const amount = format.amount(Math.abs(row.amount), currency);
  const name = row.isMe ? t`${row.name} (Ty)` : row.name;
  return (
    <View style={styles.row} accessible accessibilityLabel={balanceRowLabel(row, { baseCurrency: currency, spokenAmount: format.spokenAmount })}>
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
  nudge,
}: {
  transfer: TransferRow;
  currency: string;
  onPay: (() => void) | undefined;
  nudge: ReactNode;
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
      {nudge}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
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
