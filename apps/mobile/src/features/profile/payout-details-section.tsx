import { useLingui } from '@lingui/react/macro';
import type { PayoutDetails } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import {
  type PayoutDetailsField,
  type PayoutDetailsForm,
  parsePayoutDetailsForm,
  payoutDetailsForm,
} from './payout-details-form';
import { myPayoutDetailsQuery, useSavePayoutDetails } from './payout-details-query';

/**
 * Profile: my payout details (bank account number, BLIK phone number). Shown
 * in the "Oddaj" sheet to members of groups I share with them.
 */
export function PayoutDetailsSection() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const details = useQuery(myPayoutDetailsQuery());

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t`Dane do spłaty`}</Text>
      <Text style={styles.hint}>{t`Widzą je tylko osoby z Twoich grup, gdy mają Ci oddać pieniądze.`}</Text>
      {details.isPending ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : details.isError ? (
        <Text style={styles.error}>{t`Nie udało się wczytać danych do spłaty.`}</Text>
      ) : (
        // The fields start from the details loaded first; later refetches don't overwrite typing.
        <Form stored={details.data} />
      )}
    </View>
  );
}

function Form({ stored }: { stored: PayoutDetails }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const [form, setForm] = useState<PayoutDetailsForm>(() => payoutDetailsForm(stored));
  const [errors, setErrors] = useState<PayoutDetailsField[]>([]);
  const save = useSavePayoutDetails();

  const change = (field: PayoutDetailsField) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => e.filter((x) => x !== field));
    save.reset();
  };
  const submit = () => {
    const parsed = parsePayoutDetailsForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    save.mutate(parsed.value);
  };

  return (
    <>
      <Text style={styles.label}>{t`Numer konta`}</Text>
      <TextInput
        value={form.bankAccount}
        onChangeText={change('bankAccount')}
        placeholder="00 0000 0000 0000 0000 0000 0000"
        accessibilityLabel={t`Numer konta`}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={64}
        style={[styles.input, errors.includes('bankAccount') && styles.inputInvalid]}
      />
      {errors.includes('bankAccount') ? <Text style={styles.error}>{t`To nie wygląda na numer konta.`}</Text> : null}
      <Text style={styles.label}>{t`Telefon BLIK`}</Text>
      <TextInput
        value={form.blikPhone}
        onChangeText={change('blikPhone')}
        placeholder="600 700 800"
        accessibilityLabel={t`Telefon BLIK`}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={32}
        style={[styles.input, errors.includes('blikPhone') && styles.inputInvalid]}
      />
      {errors.includes('blikPhone') ? <Text style={styles.error}>{t`To nie wygląda na numer telefonu.`}</Text> : null}
      {save.isError ? <Text style={styles.error}>{t`Nie udało się zapisać. Spróbuj ponownie.`}</Text> : null}
      {save.isSuccess ? <Text style={styles.hint}>{t`Zapisano.`}</Text> : null}
      <Button label={t`Zapisz dane do spłaty`} onPress={submit} loading={save.isPending} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: 'stretch',
    gap: theme.space(2),
  },
  title: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
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
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  inputInvalid: {
    borderColor: theme.colors.negative,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
