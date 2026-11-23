import { useLingui } from '@lingui/react/macro';
import { Category, minorUnitDigits } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import { cleanAmountInput, parseAmountInput } from '@/features/entries/amount-input';
import { composerStore } from '@/features/entries/composer-store';
import { myMemberId } from '@/features/entries/conversation';
import { CATEGORY_ICONS, entriesQuery, useCreateEntry, useEditEntry } from '@/features/entries/entries-query';
import {
  editedEntry,
  expenseFormFromEntry,
  type FormEntry,
  isEditableInForm,
  versionConflictEntry,
} from '@/features/entries/entry-edit';
import {
  type ExpenseForm,
  type ExpenseFormField,
  type ExpenseFormKind,
  expenseFormFromComposer,
  parseExpenseForm,
  todayLocalDate,
  withDate,
  withTitle,
} from '@/features/entries/expense-draft';
import { PayersField, SplitField } from '@/features/entries/split-fields';
import { useEntryLabels } from '@/features/entries/use-entry-labels';
import { type GroupDetail, groupQuery } from '@/features/groups/groups-query';
import { authClient } from '@/lib/auth-client';
import { closeSheet } from '@/lib/close-sheet';

/**
 * The full expense form ("+" in the composer), prefilled from the composer's
 * draft. Saving creates the expense and clears the composer; dismissing
 * leaves the composer's values where they were.
 * Expense or income (#13; the payers field picks the recipients), payer(s),
 * date, category, split modes with a live preview of every member's share
 * (#12); base currency. Later: currency (#14), receipt (#26).
 * With `?entryId=` it is the edit screen (#11, long-press "Edytuj" or "Edytuj"
 * in the entry detail): prefilled from the cached entry, saved with the
 * version it was based on; a version conflict closes it and marks the bubble.
 */
export default function ExpenseFormSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId?: string }>();
  const group = useQuery(groupQuery(groupId));
  const entries = useQuery({ ...entriesQuery(groupId), enabled: entryId !== undefined });
  if (group.isPending || (entryId !== undefined && entries.isPending)) {
    return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  }
  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  if (entryId === undefined) return <ExpenseFormView group={group.data} />;
  const entry = entries.data?.find((e) => e.id === entryId);
  if (!entry || !isEditableInForm(entry)) {
    return (
      <View style={styles.content}>
        <Text style={styles.value}>{t`Tego wpisu już nie ma.`}</Text>
        <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
      </View>
    );
  }
  return <ExpenseFormView group={group.data} editing={entry} />;
}

function ExpenseFormView({ group, editing }: { group: GroupDetail; editing?: FormEntry }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const labels = useEntryLabels();
  const session = authClient.useSession();
  const me = myMemberId(group.members, session.data?.user.id);
  // One id per form: a retry after a lost response can't add the expense twice.
  const [id] = useState(() => randomUUID());
  const [form, setForm] = useState<ExpenseForm>(() =>
    editing ? expenseFormFromEntry(editing) : expenseFormFromComposer({
      draft: composerStore.get(group.id),
      group,
      members: group.members,
      myMemberId: me,
      today: todayLocalDate(),
    }),
  );
  const [errors, setErrors] = useState<ExpenseFormField[]>([]);
  const createEntry = useCreateEntry(group.id);
  const editEntry = useEditEntry(group.id);
  const [deletedMeanwhile, setDeletedMeanwhile] = useState(false);
  const saving = editing ? editEntry : createEntry;
  const digits = minorUnitDigits(group.baseCurrency);

  const update = (next: ExpenseForm, fields: ExpenseFormField[]) => {
    setForm(next);
    setErrors((current) => current.filter((f) => !fields.includes(f)));
  };

  const amount = parseAmountInput(form.amount, digits);
  const income = form.kind === 'income';
  const kinds: { kind: ExpenseFormKind; label: string }[] = [
    { kind: 'expense', label: t`Wydatek` },
    { kind: 'income', label: t`↓ Wpływ` },
  ];

  const submit = () => {
    if (editing) {
      const parsed = editedEntry(editing, form, { group, members: group.members });
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      editEntry.mutate(
        { base: editing, input: parsed.value },
        {
          onSuccess: closeSheet,
          onError: (error) => {
            const current = versionConflictEntry(error);
            // Changed by someone else: the bubble shows "!" (useEditEntry marked it).
            if (current && current.deletedAt === null) closeSheet();
            else if (current) setDeletedMeanwhile(true);
          },
        },
      );
      return;
    }
    const parsed = parseExpenseForm(form, { id, group, members: group.members });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    createEntry.mutate(parsed.value, {
      onSuccess: () => {
        composerStore.clear(group.id);
        closeSheet();
      },
    });
  };

  const fieldError: Record<ExpenseFormField, string> = {
    amount: t`Podaj kwotę większą od zera.`,
    title: t`Podaj tytuł.`,
    payer: income ? t`Wybierz, kto otrzymał pieniądze.` : t`Wybierz, kto zapłacił.`,
    date: t`Podaj datę w formacie RRRR-MM-DD.`,
    // The split and payer sections show what doesn't add up themselves.
    payerAmounts: '',
    split: '',
  };
  const errorFor = (field: ExpenseFormField) =>
    errors.includes(field) && fieldError[field] !== '' ? <Text style={styles.error}>{fieldError[field]}</Text> : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>
          {editing ? (income ? t`Edytuj wpływ` : t`Edytuj wydatek`) : income ? t`Nowy wpływ` : t`Nowy wydatek`}
        </Text>

        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t`Rodzaj wpisu`}>
          {kinds.map(({ kind, label }) => {
            const selected = (form.kind ?? 'expense') === kind;
            return (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => update({ ...form, kind }, [])}
                style={[styles.chip, selected && (kind === 'income' ? styles.chipIncome : styles.chipSelected)]}>
                <Text style={styles.chipLabel}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t`Kwota`}</Text>
          <View style={[styles.amountRow, errors.includes('amount') && styles.inputInvalid]}>
            <TextInput
              value={form.amount}
              onChangeText={(text) => update({ ...form, amount: cleanAmountInput(text, digits) }, ['amount'])}
              placeholder="0"
              accessibilityLabel={t`Kwota`}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.amountInput}
            />
            <Text style={styles.currency}>{group.baseCurrency}</Text>
          </View>
          {errorFor('amount')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t`Tytuł`}</Text>
          <TextInput
            value={form.title}
            onChangeText={(title) => update(withTitle(form, title), ['title'])}
            placeholder={t`Za co?`}
            accessibilityLabel={t`Tytuł`}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={120}
            style={[styles.input, errors.includes('title') && styles.inputInvalid]}
          />
          {errorFor('title')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t`Kategoria`}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {Category.options.map((category) => (
              <Pressable
                key={category}
                accessibilityRole="radio"
                accessibilityState={{ checked: form.category === category }}
                onPress={() => update({ ...form, category, categoryChosen: true }, [])}
                style={[styles.chip, form.category === category && styles.chipSelected]}>
                <Text style={styles.chipLabel}>
                  {CATEGORY_ICONS[category]} {labels.category[category]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <PayersField
          members={group.members}
          myMemberId={me}
          payerMemberId={form.payerMemberId}
          payers={form.payers}
          amountText={form.amount}
          amount={amount}
          digits={digits}
          currency={group.baseCurrency}
          showErrors={errors.includes('payerAmounts')}
          onChangePayer={(payerMemberId) => update({ ...form, payerMemberId }, ['payer'])}
          onChangePayers={(payers) => update({ ...form, payers }, ['payer', 'payerAmounts'])}
          income={income}
        />
        {errorFor('payer')}

        <View style={styles.field}>
          {/* TODO: native date picker; a typed ISO date works on every platform for now (as in the group form). */}
          <Text style={styles.label}>{t`Data`}</Text>
          <TextInput
            value={form.date}
            onChangeText={(date) => update(withDate(form, date, group.members), ['date', 'split'])}
            placeholder={t`RRRR-MM-DD`}
            accessibilityLabel={t`Data`}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            style={[styles.input, errors.includes('date') && styles.inputInvalid]}
          />
          {errorFor('date')}
        </View>

        <SplitField
          members={group.members}
          myMemberId={me}
          split={form.split}
          participantIds={form.participantIds}
          amount={amount}
          digits={digits}
          currency={group.baseCurrency}
          showErrors={errors.includes('split')}
          onChange={(split) => update({ ...form, split }, ['split'])}
          onChangeParticipants={(participantIds) => update({ ...form, participantIds }, ['split'])}
        />

        {deletedMeanwhile ? (
          <Text style={styles.error}>{t`Ktoś usunął ten wpis w międzyczasie. Twoje zmiany nie zostały zapisane.`}</Text>
        ) : saving.isError && !versionConflictEntry(saving.error) ? (
          <Text style={styles.error}>
            {editing
              ? t`Nie udało się zapisać zmian. Spróbuj ponownie.`
              : income
                ? t`Nie udało się dodać wpływu. Spróbuj ponownie.`
                : t`Nie udało się dodać wydatku. Spróbuj ponownie.`}
          </Text>
        ) : null}

        <Button label={t`Zapisz`} onPress={submit} loading={saving.isPending} disabled={deletedMeanwhile} />
        <Button variant="secondary" label={t`Anuluj`} onPress={closeSheet} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: {
    flex: 1,
  },
  loading: {
    padding: theme.space(6),
  },
  content: {
    gap: theme.space(4),
    padding: theme.space(4),
    paddingTop: theme.space(6),
    paddingBottom: theme.space(10),
    backgroundColor: theme.colors.background,
  },
  heading: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  field: {
    gap: theme.space(2),
  },
  label: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  value: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: theme.font.sizeMd,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  amountInput: {
    flex: 1,
    paddingVertical: theme.space(2),
    color: theme.colors.text,
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
  },
  currency: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
  inputInvalid: {
    borderColor: theme.colors.negative,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(2),
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
  },
  chipIncome: {
    borderColor: theme.colors.positive,
  },
  chipLabel: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
}));
