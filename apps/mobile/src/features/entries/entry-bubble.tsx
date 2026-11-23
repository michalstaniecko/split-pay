import { useLingui } from '@lingui/react/macro';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useFormatters } from '@/i18n/use-formatters';
import type { DayItem, EntryItem } from './conversation';
import { CATEGORY_ICONS } from './entries-query';
import { useEntryActionLabels } from './entry-actions-menu';
import type { EntryAction } from './entry-edit';

/**
 * One entry in the Conversation, from its payer: end edge when it's mine,
 * start edge otherwise (`alignSelf` follows the layout direction, so RTL
 * mirrors it). Read as one element by screen readers.
 * Long-press opens the entry actions (#11); screen readers get the same
 * actions as accessibility actions. Edited entries say "edytowano"; a change
 * rejected as a version conflict shows a red "!" that opens the conflict sheet.
 * Later slices add: income styling (#13), the base amount of a foreign
 * currency (#14), the receipt thumbnail (#26).
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
  const actionLabels = useEntryActionLabels();
  const { entry, side, payerName, otherPayers, myShare, edited } = item;
  const mine = side === 'end';
  const title = entry.kind === 'settlement' ? t`Spłata` : entry.title;
  const icon = entry.kind === 'settlement' ? '💸' : CATEGORY_ICONS[entry.category];
  const author = otherPayers > 0 ? t`${payerName} + ${otherPayers}` : payerName;
  const amount = format.amount(entry.amount, entry.currency);
  const share = myShare !== null && myShare !== 0 ? t`twój udział ${format.amount(myShare, baseCurrency)}` : null;

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
    <View style={[styles.row, mine ? styles.rowEnd : styles.rowStart]}>
      <View style={styles.withBadge}>
        {/* The "!" sits on the bubble's inner side (towards the middle of the screen). */}
        {mine ? badge : null}
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={[author, title, amount, share, editedLabel, conflictLabel].filter(Boolean).join(', ')}
          accessibilityActions={actions.map((name) => ({ name, label: actionLabels[name] }))}
          onAccessibilityAction={(event) => onAction?.(event.nativeEvent.actionName as EntryAction)}
          onPress={onPress}
          onLongPress={onLongPress}
          style={({ pressed }) => [
            styles.bubble,
            mine ? styles.mine : styles.theirs,
            highlighted && styles.highlighted,
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.author, mine && styles.mineMuted]} numberOfLines={1}>
            {author}
          </Text>
          <View style={styles.main}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={[styles.title, mine && styles.mineText]} numberOfLines={2}>
              {title}
            </Text>
          </View>
          <Text style={[styles.amount, mine && styles.mineText]}>{amount}</Text>
          {share ? <Text style={[styles.share, mine && styles.mineMuted]}>{share}</Text> : null}
          {editedLabel ? <Text style={[styles.edited, mine && styles.mineMuted]}>{editedLabel}</Text> : null}
        </Pressable>
        {mine ? null : badge}
      </View>
    </View>
  );
}

/** Sticky day separator with the group's total for the day. */
export function DaySeparator({ item, baseCurrency }: { item: DayItem; baseCurrency: string }) {
  const format = useFormatters();
  const label = format.date(item.date);
  const total = item.total > 0 ? format.amount(item.total, baseCurrency) : null;
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
  highlighted: {
    borderColor: theme.colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  author: {
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
