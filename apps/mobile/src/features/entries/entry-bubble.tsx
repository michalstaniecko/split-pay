import { useLingui } from '@lingui/react/macro';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useLocale } from '@/i18n/locale-provider';
import { useFormatters } from '@/i18n/use-formatters';
import { entryBubbleLabel } from './bubble-label';
import type { DayItem, EntryItem } from './conversation';
import { CATEGORY_ICONS } from './entries-query';
import { useEntryActionLabels } from './entry-actions-menu';
import type { EntryAction } from './entry-edit';

/**
 * One entry in the Conversation, from its payer: end edge when it's mine,
 * start edge otherwise (`alignSelf` follows the layout direction, so RTL
 * mirrors it). Read as one element by screen readers.
 * An income (#13) is from its largest recipient, labelled "↓ Wpływ" in the
 * positive colour on a surface background (on either edge).
 * A foreign-currency bubble shows the original amount large and the base
 * amount small ("≈ 86,43 zł").
 * Long-press opens the entry actions (#11); screen readers get the same
 * actions as accessibility actions. Edited entries say "edytowano"; a change
 * rejected as a version conflict shows a red "!" that opens the conflict sheet.
 * Later slices add: the receipt thumbnail (#26).
 */
export function EntryBubble({
  item,
  baseCurrency,
  highlighted,
  onPress,
  actions = [],
  onAction,
  onLongPress,
  conflict = false,
  onConflictPress,
}: {
  item: EntryItem;
  baseCurrency: string;
  highlighted: boolean;
  onPress: () => void;
  /** Accessibility actions (the long-press menu's items). */
  actions?: readonly EntryAction[];
  onAction?: (action: EntryAction) => void;
  onLongPress?: () => void;
  /** The last change was rejected as a version conflict. */
  conflict?: boolean;
  onConflictPress?: () => void;
}) {
  const { t } = useLingui();
  const format = useFormatters();
  const { locale } = useLocale();
  const actionLabels = useEntryActionLabels();
  const { entry, side, payerName, otherPayers, myShare, baseAmount, edited } = item;
  const income = entry.kind === 'income';
  // Income bubbles keep the surface background so the positive colour reads on both edges.
  const mine = side === 'end' && !income;
  const title = entry.kind === 'settlement' ? t`Spłata` : entry.title;
  const icon = entry.kind === 'settlement' ? '💸' : CATEGORY_ICONS[entry.category];
  const author = otherPayers > 0 ? t`${payerName} + ${otherPayers}` : payerName;
  const amount = format.amount(entry.amount, entry.currency);
  // An income share is money that belongs to me — shown without the minus.
  const shareAmount = myShare !== null && income ? Math.abs(myShare) : myShare;
  const share = shareAmount !== null && shareAmount !== 0 ? t`twój udział ${format.amount(shareAmount, baseCurrency)}` : null;
  const approx = baseAmount !== null ? `≈ ${format.amount(baseAmount, baseCurrency)}` : null;

  const editedLabel = edited ? t`edytowano` : null;
  const conflictLabel = conflict ? t`konflikt zmian` : null;

  const badge = conflict ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t`Konflikt zmian: ${title}. Pokaż szczegóły`}
      hitSlop={8}
      onPress={onConflictPress}
      style={styles.conflict}>
      <Text style={styles.conflictText}>!</Text>
    </Pressable>
  ) : null;

  return (
    <View style={[styles.row, side === 'end' ? styles.rowEnd : styles.rowStart]}>
      <View style={styles.withBadge}>
        {/* The "!" sits on the bubble's inner side (towards the middle of the screen). */}
        {side === 'end' ? badge : null}
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={[entryBubbleLabel(item, { baseCurrency, locale }), editedLabel, conflictLabel]
            .filter(Boolean)
            .join(', ')}
          accessibilityActions={actions.map((name) => ({ name, label: actionLabels[name] }))}
          onAccessibilityAction={(event) => onAction?.(event.nativeEvent.actionName as EntryAction)}
          onPress={onPress}
          onLongPress={onLongPress}
          style={({ pressed }) => [
            styles.bubble,
            mine ? styles.mine : styles.theirs,
            income && styles.income,
            highlighted && styles.highlighted,
            pressed && styles.pressed,
          ]}>
          <View style={styles.authorRow}>
            {/* Avatar of the largest payer (initial until user avatars exist). */}
            <View style={[styles.avatar, mine && styles.avatarMine]}>
              <Text style={[styles.avatarText, mine && styles.avatarTextMine]}>{payerName.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={[styles.author, mine && styles.mineMuted]} numberOfLines={1}>
              {author}
            </Text>
          </View>
          {income ? <Text style={styles.incomeLabel}>{t`↓ Wpływ`}</Text> : null}
          <View style={styles.main}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={[styles.title, mine && styles.mineText]} numberOfLines={2}>
              {title}
            </Text>
          </View>
          <Text style={[styles.amount, mine && styles.mineText, income && styles.incomeAmount]}>{amount}</Text>
          {approx ? <Text style={[styles.approx, mine && styles.mineMuted]}>{approx}</Text> : null}
          {share ? <Text style={[styles.share, mine && styles.mineMuted]}>{share}</Text> : null}
          {editedLabel ? <Text style={[styles.edited, mine && styles.mineMuted]}>{editedLabel}</Text> : null}
        </Pressable>
        {side === 'end' ? null : badge}
      </View>
    </View>
  );
}

/** Sticky day separator with the group's total for the day (negative when incomes outweigh expenses). */
export function DaySeparator({ item, baseCurrency }: { item: DayItem; baseCurrency: string }) {
  const format = useFormatters();
  const label = format.date(item.date);
  const total = item.total !== 0 ? format.amount(item.total, baseCurrency) : null;
  return (
    <View style={styles.dayRow} accessibilityRole="header">
      <View style={styles.dayPill}>
        <Text style={styles.dayText}>{total ? `${label} · ${total}` : label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1),
  },
  rowStart: {
    alignItems: 'flex-start',
  },
  rowEnd: {
    alignItems: 'flex-end',
  },
  withBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    maxWidth: '85%',
  },
  conflict: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.negative,
  },
  conflictText: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.onPrimary,
  },
  edited: {
    fontSize: theme.font.sizeSm,
    fontStyle: 'italic',
    color: theme.colors.textMuted,
    alignSelf: 'flex-end',
  },
  bubble: {
    flexShrink: 1,
    minWidth: 140,
    gap: theme.space(1),
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  theirs: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  mine: {
    backgroundColor: theme.colors.primary,
  },
  income: {
    borderColor: theme.colors.positive,
  },
  incomeLabel: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.positive,
  },
  incomeAmount: {
    color: theme.colors.positive,
  },
  highlighted: {
    borderColor: theme.colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.border,
  },
  avatarMine: {
    backgroundColor: theme.colors.onPrimary,
  },
  avatarTextMine: {
    color: theme.colors.primary,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  author: {
    flexShrink: 1,
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space(2),
  },
  icon: {
    fontSize: theme.font.sizeMd,
  },
  title: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  amount: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  approx: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  share: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  mineText: {
    color: theme.colors.onPrimary,
  },
  mineMuted: {
    color: theme.colors.onPrimary,
    opacity: 0.85,
  },
  dayRow: {
    alignItems: 'center',
    paddingVertical: theme.space(2),
  },
  dayPill: {
    paddingVertical: theme.space(1),
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dayText: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
