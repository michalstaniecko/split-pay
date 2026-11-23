import { useLingui } from '@lingui/react/macro';
import { type Member, minorUnitDigits } from '@split-pay/shared';
import { randomUUID } from 'expo-crypto';
import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { cleanAmountInput } from './amount-input';
import { useComposerDraft } from './composer-store';
import { useCreateEntry } from './entries-query';
import { canSendComposer, composerExpense, type ExpenseGroup, todayLocalDate } from './expense-draft';

/**
 * The Conversation's composer: amount + title (two fields mirroring the data
 * model, ADR-0017). Amount comes first — "next" moves to the title, whose
 * return key sends. Send creates an equal-split expense paid by me on the
 * default date (`composerExpense`). "+" opens the full form with these values.
 */
export function Composer({
  group,
  members,
  myMemberId,
  onOpenForm,
}: {
  group: ExpenseGroup;
  members: readonly Member[];
  myMemberId: string | null;
  onOpenForm: () => void;
}) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useComposerDraft(group.id);
  // One id per draft: a retry after a lost response can't add the expense twice.
  const [entryId, setEntryId] = useState(() => randomUUID());
  const titleRef = useRef<ComponentRef<typeof TextInput>>(null);
  const createEntry = useCreateEntry(group.id);
  const digits = minorUnitDigits(group.baseCurrency);
  const canSend = canSendComposer(draft, digits) && myMemberId !== null && !createEntry.isPending;

  const send = () => {
    if (!canSend) return;
    const expense = composerExpense({ draft, id: entryId, group, members, myMemberId, today: todayLocalDate() });
    if (!expense) return;
    createEntry.mutate(expense, {
      onSuccess: () => {
        setDraft({ amount: '', title: '' });
        setEntryId(randomUUID());
      },
    });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + theme.space(2) }]}>
      {createEntry.isError ? <Text style={styles.error}>{t`Nie udało się dodać wydatku. Spróbuj ponownie.`}</Text> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t`Pełny formularz wydatku`}
          hitSlop={8}
          onPress={onOpenForm}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Text style={styles.plus}>+</Text>
        </Pressable>
        <View style={styles.amountField}>
          <TextInput
            value={draft.amount}
            onChangeText={(text) => setDraft({ amount: cleanAmountInput(text, digits) })}
            placeholder="0"
            accessibilityLabel={t`Kwota`}
            placeholderTextColor={theme.colors.textMuted}
            // iOS's decimal pad has no return key; this keyboard has digits, comma/dot and "next".
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => titleRef.current?.focus()}
            style={styles.amountInput}
          />
          <Text style={styles.currency}>{group.baseCurrency}</Text>
        </View>
        <TextInput
          ref={titleRef}
          value={draft.title}
          onChangeText={(title) => setDraft({ title })}
          placeholder={t`Za co?`}
          accessibilityLabel={t`Tytuł`}
          placeholderTextColor={theme.colors.textMuted}
          maxLength={120}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={send}
          style={styles.titleInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t`Wyślij`}
          accessibilityState={{ disabled: !canSend, busy: createEntry.isPending }}
          disabled={!canSend}
          onPress={send}
          style={({ pressed }) => [styles.sendButton, (!canSend || pressed) && styles.dimmed]}>
          <Text style={styles.sendLabel}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(1),
    paddingTop: theme.space(2),
    paddingHorizontal: theme.space(2),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
  },
  plus: {
    fontSize: theme.font.sizeXl,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: theme.space(2),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  amountInput: {
    minWidth: 56,
    maxWidth: 110,
    paddingVertical: theme.space(2),
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  currency: {
    marginStart: theme.space(1),
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  titleInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  dimmed: {
    opacity: 0.4,
  },
  sendLabel: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.onPrimary,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
