import { useLingui } from '@lingui/react/macro';
import { type PayoutDetails, settleUpSummary } from '@split-pay/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { entriesQuery } from '@/features/entries/entries-query';
import type { GroupDetail } from '@/features/groups/groups-query';
import { useLocale } from '@/i18n/locale-provider';
import { type GroupBalances, memberPayoutDetailsQuery } from './balances-query';

const COPIED_MS = 2000;

/**
 * "Udostępnij" and "Kopiuj" for the settle-up summary (SPEC → Settle-up): the
 * group name, its expenses and the transfers still to make, with each
 * recipient's payout details when they have them. Both are inactive when
 * every balance is zero (no transfers).
 */
export function SettleUpSummaryActions({ group, balances }: { group: GroupDetail; balances: GroupBalances }) {
  const { t } = useLingui();
  const { locale } = useLocale();
  const entries = useQuery(entriesQuery(group.id));
  const recipients = [...new Set(balances.transfers.map((transfer) => transfer.to))];
  const payouts = useQueries({
    queries: recipients.map((memberId) => memberPayoutDetailsQuery(group.id, memberId)),
  });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  // Payout details that failed or are still loading are simply left out.
  const payoutDetails: Record<string, PayoutDetails> = {};
  recipients.forEach((memberId, i) => {
    const data = payouts[i]?.data;
    if (data) payoutDetails[memberId] = data;
  });

  const message = () =>
    settleUpSummary({
      group: { name: group.name, baseCurrency: balances.baseCurrency },
      entries: entries.data ?? [],
      members: group.members,
      settleUp: balances,
      payoutDetails,
      locale,
      labels: { bankAccount: t`Nr konta`, blikPhone: t`BLIK` },
    });

  const disabled = balances.transfers.length === 0 || !entries.data;
  const share = () => void Share.share({ message: message() }).catch(() => undefined);
  const copy = async () => {
    await Clipboard.setStringAsync(message());
    setCopied(true);
  };

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <View style={styles.cell}>
        <Button variant="secondary" label={t`Udostępnij`} disabled={disabled} onPress={share} />
      </View>
      <View style={styles.cell}>
        <Button
          variant="secondary"
          label={copied ? t`Skopiowano` : t`Kopiuj`}
          disabled={disabled}
          onPress={() => void copy()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.space(2),
  },
  cell: {
    flex: 1,
  },
}));
