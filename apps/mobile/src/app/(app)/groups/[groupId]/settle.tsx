import { useLingui } from '@lingui/react/macro';
import { formatBankAccount, hasPayoutDetails } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import { memberPayoutDetailsQuery } from '@/features/balances/balances-query';
import { groupQuery } from '@/features/groups/groups-query';
import { useFormatters } from '@/i18n/use-formatters';
import { closeSheet } from '@/lib/close-sheet';

/** How long "Skopiowano" replaces a copy button's label. */
const COPIED_MS = 2000;

/**
 * "Oddaj" sheet (from my transfer in the balance drawer): the recipient's
 * payout details with copy buttons. No payment integration.
 * TODO(#10): editable prefilled amount + "Zapisz spłatę" (records the settlement).
 */
export default function SettleSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const format = useFormatters();
  const { groupId, to, amount } = useLocalSearchParams<{ groupId: string; to: string; amount: string }>();
  const group = useQuery(groupQuery(groupId));
  const details = useQuery(memberPayoutDetailsQuery(groupId, to));

  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  if (!group.data) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;

  const recipient = group.data.members.find((m) => m.id === to)?.displayName ?? '?';
  const formatted = format.amount(Number(amount) || 0, group.data.baseCurrency);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t`Oddaj ${recipient}`}</Text>
      <Text style={styles.amount} accessibilityLabel={t`Kwota: ${formatted}`}>
        {formatted}
      </Text>

      <Text style={styles.heading}>{t`Dane do spłaty`}</Text>
      {details.isPending ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : details.isError ? (
        <View style={styles.box}>
          <Text style={styles.muted}>{t`Nie udało się wczytać danych do spłaty.`}</Text>
          <Pressable accessibilityRole="button" onPress={() => void details.refetch()}>
            <Text style={styles.link}>{t`Spróbuj ponownie`}</Text>
          </Pressable>
        </View>
      ) : !hasPayoutDetails(details.data) ? (
        <Text style={styles.muted}>{t`Brak danych do spłaty. Zapytaj o nie bezpośrednio.`}</Text>
      ) : (
        <View style={styles.box}>
          {details.data.bankAccount ? (
            <CopyRow
              label={t`Numer konta`}
              value={formatBankAccount(details.data.bankAccount)}
              copyValue={details.data.bankAccount}
            />
          ) : null}
          {details.data.blikPhone ? (
            <CopyRow label={t`Telefon BLIK`} value={details.data.blikPhone} copyValue={details.data.blikPhone} />
          ) : null}
        </View>
      )}
      <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
    </ScrollView>
  );
}

/**
 * A payout detail with a copy button. `copyValue` is what lands in the
 * clipboard (no grouping spaces, so banking apps accept it).
 */
function CopyRow({ label, value, copyValue }: { label: string; value: string; copyValue: string }) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await Clipboard.setStringAsync(copyValue);
    setCopied(true);
  };
  return (
    <View style={styles.row}>
      <View style={styles.detail} accessible accessibilityLabel={`${label}: ${value}`}>
        <Text style={styles.muted}>{label}</Text>
        <Text style={styles.value} selectable>
          {value}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t`Kopiuj: ${label}`}
        accessibilityLiveRegion="polite"
        onPress={() => void copy()}
        style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
        <Text style={styles.copyLabel}>{copied ? t`Skopiowano` : t`Kopiuj`}</Text>
      </Pressable>
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
  title: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  amount: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  heading: {
    marginTop: theme.space(2),
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  box: {
    gap: theme.space(2),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space(2),
    minHeight: 48,
  },
  detail: {
    flex: 1,
    minWidth: 160,
    gap: theme.space(0.5),
  },
  value: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  copy: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  copyLabel: {
    fontSize: theme.font.sizeSm,
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
  link: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
  },
}));
