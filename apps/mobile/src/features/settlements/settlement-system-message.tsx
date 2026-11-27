import { useLingui } from '@lingui/react/macro';
import { isEdited, type Member, type Settlement } from '@split-pay/shared';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Icon } from '@/components/icon';
import { CategoryIcon } from '@/features/entries/category-icon-view';
import { useEntryActionLabels } from '@/features/entries/entry-actions-menu';
import type { EntryAction } from '@/features/entries/entry-edit';
import { useLocale } from '@/i18n/locale-provider';
import { settlementMessage } from './settlement-message';

/**
 * A settlement in the Conversation (ADR-0017): a centred system message
 * (settlement icon, "Spłata: Bartek → Ania · 30,50 zł") instead of a bubble, so it can't be
 * mistaken for an expense. Tap opens the entry detail.
 * Long-press opens the same entry actions as a bubble (#11; `entryActions`),
 * also offered as accessibility actions. Edited settlements say "edytowano";
 * a change rejected as a version conflict shows a red "!" after the pill.
 * Outbox state (#22): a clock icon while queued; a refused send also shows the red "!".
 */
export function SettlementSystemMessage({
  entry,
  members,
  myMemberId,
  highlighted,
  onPress,
  actions = [],
  onAction,
  onLongPress,
  conflict = false,
  onConflictPress,
  queued = false,
  failed = false,
}: {
  entry: Settlement;
  members: readonly { id: string; displayName: string }[];
  myMemberId: string | null;
  highlighted: boolean;
  onPress: () => void;
  /** Accessibility actions (the long-press menu's items). */
  actions?: readonly EntryAction[];
  onAction?: (action: EntryAction) => void;
  onLongPress?: () => void;
  /** The last change was rejected as a version conflict. */
  conflict?: boolean;
  /** Pressing the red "!" (conflict or failed send). */
  onConflictPress?: () => void;
  /** Waiting in the outbox to be sent (clock icon). */
  queued?: boolean;
  /** The server refused it from the outbox (red "!" → retry sheet). */
  failed?: boolean;
}) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { locale } = useLocale();
  const actionLabels = useEntryActionLabels();
  const { text, label } = settlementMessage(entry, { members, myMemberId, locale });
  const title = t`Spłata`;
  const edited = isEdited(entry) ? t`edytowano` : null;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[label, edited, conflict ? t`konflikt zmian` : null, failed ? t`nie wysłano` : queued ? t`czeka na wysłanie` : null].filter(Boolean).join(', ')}
        accessibilityActions={actions.map((name) => ({ name, label: actionLabels[name] }))}
        onAccessibilityAction={(event) => onAction?.(event.nativeEvent.actionName as EntryAction)}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.message, highlighted && styles.highlighted, pressed && styles.pressed]}>
        <CategoryIcon category="settlement" size={theme.font.sizeSm} />
        <Text style={styles.text}>
          {text}
          {edited ? <Text style={styles.edited}> · {edited}</Text> : null}
        </Text>
        {queued && !failed ? <Icon name="Clock" size={theme.font.sizeSm} color={theme.colors.textMuted} /> : null}
      </Pressable>
      {conflict || failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={conflict ? t`Konflikt zmian: ${title}. Pokaż szczegóły` : t`Nie wysłano: ${title}. Pokaż szczegóły`}
          hitSlop={8}
          onPress={onConflictPress}
          style={styles.conflict}>
          <Text style={styles.conflictText}>!</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    marginVertical: theme.space(1),
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    flexShrink: 1,
    maxWidth: '90%',
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1.5),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  highlighted: {
    borderColor: theme.colors.primary,
  },
  text: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  edited: {
    fontWeight: 'normal',
    fontStyle: 'italic',
    color: theme.colors.textMuted,
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
  pressed: {
    opacity: 0.6,
  },
}));
