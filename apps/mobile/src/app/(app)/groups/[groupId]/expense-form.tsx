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
import { CATEGORY_ICONS, useCreateEntry } from '@/features/entries/entries-query';
import {
  type ExpenseForm,
  type ExpenseFormField,
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
 * Payer(s), date, category, split modes with a live preview of every
 * member's share (#12); base currency. Later: income (#13), currency (#14),
 * receipt (#26), and editing with `?entryId=` (#11).
 */
export default function ExpenseFormSheet() {
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useQuery(groupQuery(groupId));
  if (group.isPending) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  return <ExpenseFormView group={group.data} />;
}

function ExpenseFormView({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const labels = useEntryLabels();
  const session = authClient.useSession();
  const me = myMemberId(group.members, session.data?.user.id);
  // One id per form: a retry after a lost response can't add the expense twice.
  const [id] = useState(() => randomUUID());
  const [form, setForm] = useState<ExpenseForm>(() =>
    expenseFormFromComposer({ draft: composerStore.get(group.id), group, myMemberId: me, today: todayLocalDate() }),
  );
  const [errors, setErrors] = useState<ExpenseFormField[]>([]);
  const createEntry = useCreateEntry(group.id);
  const digits = minorUnitDigits(group.baseCurrency);

  const update = (next: ExpenseForm, fields: ExpenseFormField[]) => {
    setForm(next);
    setErrors((current) => current.filter((f) => !fields.includes(f)));
  };

  const amount = parseAmountInput(form.amount, digits);

  const submit = () => {
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
    payer: t`Wybierz, kto zapłacił.`,
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
        <Text style={styles.heading}>{t`Nowy wydatek`}</Text>

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
          date={form.date.trim()}
          amount={amount}
          digits={digits}
          currency={group.baseCurrency}
          showErrors={errors.includes('split')}
          onChange={(split) => update({ ...form, split }, ['split'])}
        />

        {createEntry.isError ? <Text style={styles.error}>{t`Nie udało się dodać wydatku. Spróbuj ponownie.`}</Text> : null}

        <Button label={t`Zapisz`} onPress={submit} loading={createEntry.isPending} />
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
  chipLabel: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
}));
