import { useLingui } from '@lingui/react/macro';
import { type CurrencyCode, minorUnitDigits } from '@split-pay/shared';
import { randomUUID } from 'expo-crypto';
import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { cleanAmountInput } from '@/features/entries/amount-input';
import { useCreateQuickBill } from '@/features/entries/entries-query';
import { todayLocalDate } from '@/features/entries/expense-draft';
import {
  addPerson,
  defaultQuickBillCurrency,
  initialQuickBillDraft,
  parseQuickBillDraft,
  type QuickBillDraft,
  type QuickBillField,
  removePerson,
  withQuickBillCurrency,
} from '@/features/entries/quick-bill-form';
import { BASE_CURRENCIES, GROUP_COLORS } from '@/features/groups/new-group-form';
import { closeSheet } from '@/lib/close-sheet';

/**
 * "Szybki rachunek": amount, title and "Z kim" chips → in one step a group
 * named after the title (🧾), a member without an account per chip and one
 * equal-split expense paid by me, dated today (POST /quick-bills). The
 * currency defaults to the device region's (PLN fallback) and becomes the
 * group's base currency and the expense currency (rate 1).
 */
export default function QuickBillSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  // Ids generated once per sheet: a retry after a lost response can't create a second group.
  const [ids] = useState(() => ({
    groupId: randomUUID(),
    expenseId: randomUUID(),
    pendingPersonId: randomUUID(),
    color: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)] ?? GROUP_COLORS[0],
  }));
  const [draft, setDraft] = useState<QuickBillDraft>(initialQuickBillDraft);
  const [currency, setCurrency] = useState<CurrencyCode>(() =>
    defaultQuickBillCurrency(getLocales()[0]?.currencyCode),
  );
  const [errors, setErrors] = useState<QuickBillField[]>([]);
  const createQuickBill = useCreateQuickBill();
  const digits = minorUnitDigits(currency);

  const update = (next: QuickBillDraft, fields: QuickBillField[]) => {
    setDraft(next);
    setErrors((current) => current.filter((f) => !fields.includes(f)));
  };

  const changeCurrency = (next: CurrencyCode) => {
    setCurrency(next);
    update(withQuickBillCurrency(draft, next), ['amount']);
  };

  const submit = () => {
    const parsed = parseQuickBillDraft(draft, {
      ...ids,
      currency,
      today: todayLocalDate(),
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    createQuickBill.mutate(parsed.value, {
      onSuccess: ({ group }) => {
        closeSheet();
        router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } });
      },
    });
  };

  return (
    // No KeyboardAvoidingView: in an iOS form sheet it left the sheet blank whenever the form
    // rendered on the first frame (this sheet has no loading state, so it always does).
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <Text style={styles.heading}>🧾 {t`Szybki rachunek`}</Text>

      <View style={styles.field}>
        <View style={[styles.amountRow, errors.includes('amount') && styles.inputInvalid]}>
          <TextInput
            value={draft.amount}
            onChangeText={(text) => update({ ...draft, amount: cleanAmountInput(text, digits) }, ['amount'])}
            placeholder="0"
            accessibilityLabel={t`Kwota`}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            autoFocus
            style={styles.amountInput}
          />
          <Text style={styles.currency}>{currency}</Text>
        </View>
        {errors.includes('amount') ? <Text style={styles.error}>{t`Podaj kwotę większą od zera.`}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t`Waluta`}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {BASE_CURRENCIES.map((code) => (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityState={{ checked: currency === code }}
              onPress={() => changeCurrency(code)}
              style={[styles.currencyChip, currency === code && styles.chipSelected]}>
              <Text style={styles.currencyChipLabel}>{code}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <TextInput
          value={draft.title}
          onChangeText={(title) => update({ ...draft, title }, ['title'])}
          placeholder={t`Za co? np. Pizza u Kasi`}
          accessibilityLabel={t`Tytuł`}
          placeholderTextColor={theme.colors.textMuted}
          maxLength={80}
          style={[styles.input, errors.includes('title') && styles.inputInvalid]}
        />
        {errors.includes('title') ? <Text style={styles.error}>{t`Podaj tytuł.`}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t`Z kim`}</Text>
        {draft.people.length > 0 ? (
          <View style={styles.chips}>
            {draft.people.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={t`Usuń ${person.displayName}`}
                onPress={() => update(removePerson(draft, person.id), [])}
                style={styles.chip}>
                <Text style={styles.chipLabel}>{person.displayName} ✕</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextInput
          value={draft.personName}
          onChangeText={(personName) => update({ ...draft, personName }, ['people'])}
          onSubmitEditing={() => update(addPerson(draft, randomUUID()), ['people'])}
          submitBehavior="submit"
          placeholder={t`Imię, potem Enter`}
          accessibilityLabel={t`Dodaj osobę`}
          placeholderTextColor={theme.colors.textMuted}
          maxLength={60}
          returnKeyType="next"
          style={[styles.input, errors.includes('people') && styles.inputInvalid]}
        />
        {errors.includes('people') ? <Text style={styles.error}>{t`Dodaj co najmniej jedną osobę.`}</Text> : null}
        <Text style={styles.hint}>{t`Każda osoba trafi do grupy jako osoba bez konta. Płacisz Ty, dzielimy po równo.`}</Text>
      </View>

      {createQuickBill.isError ? (
        <Text style={styles.error}>{t`Nie udało się utworzyć rachunku. Spróbuj ponownie.`}</Text>
      ) : null}

      <Button label={t`Utwórz`} onPress={submit} loading={createQuickBill.isPending} />
      <Button variant="secondary" label={t`Anuluj`} onPress={closeSheet} />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: {
    flex: 1,
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
  hint: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
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
    minHeight: 56,
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
    fontSize: theme.font.sizeXl,
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
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipLabel: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
  currencyChip: {
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
  currencyChipLabel: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
}));
