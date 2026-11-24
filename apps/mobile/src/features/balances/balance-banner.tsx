import { useLingui } from '@lingui/react/macro';
import type { Allocation } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useLocale } from '@/i18n/locale-provider';
import { useFormatters } from '@/i18n/use-formatters';
import { bannerLabel } from './balance-label';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { bannerState } from './balances';
import { balancesQuery } from './balances-query';

/**
 * The balance banner on top of the Conversation: my balance in the base
 * currency; tap → the balance drawer. Text wraps (no fixed height), so it
 * grows to two lines with large Dynamic Type instead of truncating the amount.
 * Screen readers hear the amount with the currency name (`bannerLabel`, #36).
 */
export function BalanceBanner({ groupId, myMemberId }: { groupId: string; myMemberId: string | null }) {
  const balances = useQuery(balancesQuery(groupId));
  useRefreshOnFocus(balances.refetch);
  if (!balances.data) return null;
  return (
    <BalanceBannerView
      balances={balances.data}
      myMemberId={myMemberId}
      onPress={() => router.push({ pathname: '/groups/[groupId]/balances', params: { groupId } })}
    />
  );
}

/** The banner itself, for given balances (also used by the view-only web). */
export function BalanceBannerView({
  balances,
  myMemberId,
  onPress,
}: {
  balances: { baseCurrency: string; balances: readonly Allocation[] };
  myMemberId: string | null;
  onPress: () => void;
}) {
  const { t } = useLingui();
  const format = useFormatters();
  const { locale } = useLocale();
  const state = bannerState(balances, myMemberId);
  const amount = format.amount(state.amount, balances.baseCurrency);
  const text =
    state.kind === 'owe' ? t`Jesteś winien ${amount}` : state.kind === 'owed' ? t`Należy ci się ${amount}` : t`Wszystko rozliczone`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bannerLabel(state, { baseCurrency: balances.baseCurrency, locale })}
      accessibilityHint={t`Pokazuje salda i kto komu ile oddaje`}
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}>
      <View style={styles.row}>
        <Text style={[styles.text, state.kind === 'owe' && styles.owe, state.kind === 'owed' && styles.owed]}>
          {text}
        </Text>
        <Text style={styles.more}>{t`Salda ›`}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  banner: {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space(2),
  },
  text: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  owe: {
    color: theme.colors.negative,
  },
  owed: {
    color: theme.colors.positive,
  },
  more: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
}));
